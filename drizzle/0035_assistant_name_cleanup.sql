-- One-off cleanup (audit 2026-11-05, A1 and A9). Data only; safe to run twice.
-- 1. The assistant has no fixed name (owner, 2026-11-05: option a). A saved name of exactly
--    "Jarvis" was the old default, so it is cleared and those people see "your assistant"
--    until they choose one. Every other saved name stays.
UPDATE "users" SET "preferences" = "preferences" - 'assistantName'
WHERE btrim("preferences"->>'assistantName') = 'Jarvis';
--> statement-breakpoint
-- 2. Rows behind row-level security are rewritten per person (app.user_id), like the app does:
--    - the old generated chat errors (they named the provider and its settings) get the new
--      wording; only the assistant's own error replies, never what anyone wrote;
--    - an old web search failure saved in a tool result (it carried the provider's raw text);
--    - voice chat titles that are exactly the old generated default get the new one, unless
--      the title came from what the person typed.
DO $$
DECLARE u record;
BEGIN
  FOR u IN SELECT "id", coalesce(nullif(btrim("preferences"->>'assistantName'), ''), 'your assistant') AS "name" FROM "users" LOOP
    PERFORM set_config('app.user_id', u."id"::text, true);

    UPDATE "messages" SET "content" = CASE
        WHEN "content" IN (
          'Jarvis couldn''t authenticate with OpenAI. Check OPENAI_API_KEY on the server.',
          'The configured OpenAI model wasn''t found. Check OPENAI_MODEL.'
        ) THEN 'Your assistant isn''t available right now. Try again later.'
        WHEN "content" = 'OpenAI is rate-limiting requests or the account is out of quota. Try again shortly.'
          THEN 'Your assistant is busy right now. Try again in a minute.'
        WHEN "content" = 'OpenAI is having trouble right now. Please try again.'
          THEN 'Your assistant isn''t available right now. Try again in a minute.'
        WHEN "content" = 'Jarvis couldn''t reach the AI service (network error). Nothing further was changed.'
          THEN 'Your assistant couldn''t get through just now. Try again in a minute. Nothing else was changed.'
        ELSE 'Something went wrong while your assistant was answering. Try again. Anything already shown as done was saved.'
      END
    WHERE "user_id" = u."id" AND "conversation_id" IN (SELECT "id" FROM "conversations" WHERE "user_id" = u."id") AND "role" = 'assistant' AND "status" = 'error' AND (
      "content" IN (
        'Jarvis couldn''t authenticate with OpenAI. Check OPENAI_API_KEY on the server.',
        'The configured OpenAI model wasn''t found. Check OPENAI_MODEL.',
        'OpenAI is rate-limiting requests or the account is out of quota. Try again shortly.',
        'OpenAI is having trouble right now. Please try again.',
        'Jarvis couldn''t reach the AI service (network error). Nothing further was changed.',
        'Something went wrong while Jarvis was responding. Any actions already reported as completed were saved.'
      )
      OR ("content" LIKE 'Something went wrong while Jarvis was responding: %' AND "content" LIKE '%. Any actions already reported as completed were saved.')
    );

    UPDATE "messages" SET "tool_result" = jsonb_set("tool_result", '{data,unavailable}', to_jsonb('Live web search isn''t available right now.'::text))
    WHERE "user_id" = u."id" AND "conversation_id" IN (SELECT "id" FROM "conversations" WHERE "user_id" = u."id") AND "role" = 'tool' AND "tool_name" = 'web_search'
      AND "tool_result"->'data'->>'unavailable' LIKE 'The web search failed%';

    UPDATE "conversations" c SET "title" = 'Talking with ' || u."name"
    WHERE c."user_id" = u."id" AND c."title" IN ('Talking with Jarvis', 'Voice chat with Jarvis')
      AND NOT EXISTS (
        SELECT 1 FROM "messages" m WHERE m."conversation_id" = c."id" AND m."role" = 'user' AND m."content" = c."title"
      );
  END LOOP;
  PERFORM set_config('app.user_id', '', true);
END $$;
