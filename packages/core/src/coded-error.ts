/**
 * The one shape a failure has, everywhere. SPEC.md §16, CONVENTIONS.md C-A10.
 *
 * A stable code that the interface can word, and a message that is either
 * the words of the tool that failed — git's, which the author is shown as
 * they came — or empty. Four classes of this shape had grown up on four
 * sides of the bridge, and the bridge duck-typed between them; anything with
 * a `code` property passed, which is how Node's `ENOENT` reached the
 * renderer with an absolute path in its message.
 *
 * Adapters subclass it to carry what they know — a path, an exit code — but
 * the bridge and the interface see only this.
 */
export class CodedError extends Error {
  readonly code: string;

  constructor(code: string, message = '') {
    super(message);
    this.name = 'CodedError';
    this.code = code;
  }
}
