/**
 * Third-party text (email, documents) goes to the model inside a marker pair such as
 * <untrusted_email>…</untrusted_email>. The text itself must not be able to close or
 * reopen a marker, so any "<" that starts a closing tag or an "untrusted" tag is
 * turned into "&lt;". Other text is left as it is.
 */
export const neutralize = (s: string) => s.replace(/<(?=\s*\/|\s*!|\s*untrusted)/gi, "&lt;");

export const wrapUntrusted = (tag: string, s: string) => `<${tag}>\n${neutralize(s)}\n</${tag}>`;
