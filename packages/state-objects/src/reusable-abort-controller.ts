/**
 * A reusable {@link AbortController} that creates a new AbortController when {@link abort} is cancelled.
 *
 * When passed to a method, it allows that method to cancel old requests and replace them with a new request.
 *
 * This is needed because the standard AbortController aborts all future requests too if `abort()` has been called.
 */
export class ReusableAbortController extends AbortController {

    handle: AbortController = new AbortController();

    /**
     * Returns the current signal.
     */
    get signal(): AbortSignal {
        return this.handle.signal;
    }

    /**
     * Aborts uses of the current {@link ReusableAbortController.signal} and creates a new internal controller.
     * Calls to {@link signal} after this method has been called will return a new signal.
     *
     * @param reason an optional reason for the abort.
     */
    abort(reason?: string) {
        this.handle.abort(reason);
        this.handle = new AbortController();
    }
}