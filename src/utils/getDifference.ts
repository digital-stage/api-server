/* eslint-disable @typescript-eslint/no-explicit-any,@typescript-eslint/no-unsafe-argument,@typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-assignment */
const getDifference = (a: any, b: any): any =>
    Object.entries(a).reduce((ac, [k, v]) => (b[k] && b[k] !== v ? ((ac[k] = b[k]), ac) : ac), {})

export { getDifference }
