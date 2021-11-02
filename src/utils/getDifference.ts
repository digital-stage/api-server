/* eslint-disable @typescript-eslint/no-explicit-any,@typescript-eslint/no-unsafe-argument,@typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-assignment */

import isEqual from 'lodash/isEqual'

const getDifference = (a: Record<string, any>, b: Record<string, any>): Record<string, any> => {
    return Object.entries(a).reduce<Record<string, any>>((ac, [k, v]) => {
        if (b[k] && !isEqual(b[k], v)) {
            ac[k] = b[k]
            return ac
        }
        return ac
    }, {})
}

export { getDifference }
