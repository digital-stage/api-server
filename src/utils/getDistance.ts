function toRadiance(point: number) {
    return (point * Math.PI) / 180
}

interface Coordinate {
    lat: number
    lng: number
}

const getDistance = (position1: Coordinate, position2: Coordinate): number => {
    const lat1 = position1.lat
    const lat2 = position2.lat
    const lng1 = position1.lng
    const lng2 = position2.lng
    const R = 6371000
    const φ1 = toRadiance(lat1)
    const φ2 = toRadiance(lat2)
    const Δφ = toRadiance(lat2 - lat1)
    const Δλ = toRadiance(lng2 - lng1)
    const a =
        Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
}
export default getDistance
