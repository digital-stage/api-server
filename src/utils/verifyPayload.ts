const verifyPayload = (
    payload: {
        [field: string]: unknown
    },
    fields: string[],
    callback?: (error?: string) => void
): boolean => {
    fields.forEach((field) => {
        if (!payload[field]) {
            if (callback) callback(field + ' is missing')
            return false
        }
    })
    return true
}

export { verifyPayload }
