import Foundation

/// Distancia en kilómetros entre dos coordenadas (fórmula de haversine).
func haversineKm(_ lat1: Double, _ lon1: Double, _ lat2: Double, _ lon2: Double) -> Double {
    let earthRadiusKm = 6371.0
    let dLat = (lat2 - lat1) * .pi / 180
    let dLon = (lon2 - lon1) * .pi / 180
    let a = sin(dLat / 2) * sin(dLat / 2)
        + cos(lat1 * .pi / 180) * cos(lat2 * .pi / 180)
        * sin(dLon / 2) * sin(dLon / 2)
    let c = 2 * atan2(sqrt(a), sqrt(1 - a))
    return earthRadiusKm * c
}

extension String {
    /// `nil` si la cadena está vacía. Para columnas donde «vacío» y «no hay» son lo mismo
    /// y solo una de las dos formas es la verdadera — ver `Font.name`.
    var nilIfEmpty: String? { isEmpty ? nil : self }
}
