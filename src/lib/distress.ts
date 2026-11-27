/**
 * Does a message read like the person may be in real distress (INSTRUCTIONS, "When someone is struggling")? Used to keep
 * the app's own machinery out of the way: the answer checks never judge, hold or send back a reply to such a message
 * (COO review, 2026-11-27). Broad on purpose: a false yes only means an answer goes out unchecked; a miss could hold back a
 * reply to someone who needs it now. The model's own instructions still decide how to answer; this decides nothing about that.
 * Everyday stress words ("this week is killing me", "dying of boredom") are not this.
 */
const DISTRESS =
  /\b(want(ed)? to die|wanna die|wish i (was|were) dead|wish i (wasn'?t|weren'?t) (here|alive|around)|(don'?t|do not) want to (be here|be alive|live|wake up|exist)|kill(ing)? myself|end (it all|my life|things)|suicid\w*|self[- ]?harm|hurt(ing)? myself|cut(ting)? myself|(hurt|kill) (someone|somebody|him|her|them)\b|(not|n'?t) safe at home|(he|she|they) (hit|hits|hurt|hurts) me|i'?m in danger|can'?t (go on|do this anymore|keep going)|no (point|reason) (in )?(living|going on|to live)|what'?s the point (of|in) (living|anything|it all)|better off without me|nobody would (care|miss me)|overdose|took (too many|a bunch of) pills)\b/i;

export function looksLikeDistress(text: string): boolean {
  return DISTRESS.test(text.replace(/[’‘]/g, "'"));
}
