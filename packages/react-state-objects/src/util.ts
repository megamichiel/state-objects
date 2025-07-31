import {useRef} from "react";

/**
 * A `useMemo`-like function that passes the dependencies and optional additional arguments to the memoization function.
 * This makes it possible to use a global constant version of the function rather than having to re-create the function
 *  on every draw.
 *
 * @param func The memoization function.
 * @param args The arguments passed to `func`.
 * @param depLength Specifies the length of `args` that are considered dependencies.
 *  Values beyond this length are ignored for change checks. Defaults to `args.length`.
 */
export const useFastMemo = <TValue, TArgs extends unknown[]>(
    func: (...args: TArgs) => TValue,
    args: TArgs,
    depLength: number = args.length
): TValue => {
    const ref = useRef<any>(undefined);
    const data = ref.current;

    if (data === undefined) {
        const newValue = func(...args);
        ref.current = [...args.slice(0, depLength), newValue];
        return newValue;
    }

    if (depLength !== data.length - 1) {
        throw new Error(`Length of deps changed between useRefMemo() calls, from ${data.length - 1} to ${depLength}`);
    }

    for (let i = 0; i < depLength; i++) {
        if (args[i] !== data[i]) {
            const newValue = func(...args);
            ref.current = [...args.slice(0, depLength), newValue];
            return newValue;
        }
    }

    return data[depLength];
};