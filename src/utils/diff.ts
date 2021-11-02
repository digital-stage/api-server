/* eslint-disable @typescript-eslint/no-explicit-any,@typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-argument,@typescript-eslint/no-unsafe-assignment */
function diff(
    obj1: Record<string, unknown>,
    obj2: Record<string, unknown>
): Record<string, unknown> | undefined {
    const result = {}
    if (Object.is(obj1, obj2)) {
        return undefined
    }
    if (!obj2 || typeof obj2 !== 'object') {
        return obj2
    }
    Object.keys(obj1 || {})
        .concat(Object.keys(obj2 || {}))
        .forEach((key) => {
            if (obj2[key] !== obj1[key] && !Object.is(obj1[key], obj2[key])) {
                result[key] = obj2[key]
            }
            if (typeof obj2[key] === 'object' && typeof obj1[key] === 'object') {
                const value = diff(
                    obj1[key] as Record<string, unknown>,
                    obj2[key] as Record<string, unknown>
                )
                if (value !== undefined) {
                    result[key] = value
                }
            }
        })
    return result
}

export { diff }
