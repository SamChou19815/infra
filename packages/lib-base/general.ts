export const error = (message?: string): never => {
  throw new Error(message);
};

export const isNotNull = <V>(value: V | null | undefined): value is V => value != null;

export const ignore = (): void => {};

export function assert(condition: unknown, msg?: string): asserts condition {
  if (!condition) {
    throw new Error(msg);
  }
}

export const checkNotNull = <V>(value: V | null | undefined, msg?: string): V => {
  assert(value != null, msg ?? `Value is asserted to be not null, but it is ${value}.`);
  return value;
};

export const zip = <A, B>(list1: readonly A[], list2: readonly B[]): readonly (readonly [A, B])[] =>
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  list1.map((e1, i) => [e1, list2[i]!]);

export const zip3 = <A, B, C>(
  list1: readonly A[],
  list2: readonly B[],
  list3: readonly C[]
): readonly (readonly [A, B, C])[] =>
  list1.map((e1, i) => [e1, checkNotNull(list2[i]), checkNotNull(list3[i])]);
