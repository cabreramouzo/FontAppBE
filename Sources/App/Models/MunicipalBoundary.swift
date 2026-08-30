import Fluent
import Vapor

/// El contorno de un municipio, para poder dibujarlo en un mapa.
///
/// Sale de los **recintos municipales del IGN**, los mismos con los que
/// `populate-municipalities` decide en qué municipio cae cada fuente. Que el mapa pinte
/// exactamente el mismo polígono que clasificó las fuentes no es un detalle: si se
/// dibujara otro —una aproximación, o los límites de otro proveedor— habría fuentes
/// pintadas fuera de su propio municipio y nadie sabría cuál de las dos cosas está mal.
///
/// ## Por qué en la base y no en un fichero
///
/// El GeoJSON de origen son **13 MB** y por eso está en `.gitignore`: no se versiona ni
/// se despliega. Guardando el contorno ya simplificado, servir uno cuesta unos 2 KB
/// (mediana medida: 1,8 KB; el mayor, 10 KB) y el servidor no tiene que cargar nada en
/// memoria al arrancar.
final class MunicipalBoundary: Model, @unchecked Sendable {
    static let schema = "municipal_boundaries"

    /// El código INE es la clave, no el nombre: hay municipios homónimos en provincias
    /// distintas. Misma regla que en `fonts.municipality_ine`.
    @ID(custom: "ine", generatedBy: .user) var id: String?
    @Field(key: "name") var name: String
    /// Anillos en formato MultiPolygon de GeoJSON: `[polígono][anillo][punto][lon, lat]`.
    /// Todo se normaliza a MultiPolygon al importar —un `Polygon` se envuelve— para que
    /// el cliente no tenga que distinguir dos formas de lo mismo.
    ///
    /// Va **envuelto en una estructura** y no como array suelto a propósito: con
    /// `[[[[Double]]]]` directamente, PostgresNIO no ve un JSON sino un array de Postgres
    /// e intenta codificarlo como `DOUBLE PRECISION[]` — revienta en tiempo de ejecución
    /// («No array type for DOUBLE PRECISION[]») aunque la columna sea `.json` y aunque
    /// compile perfectamente. Envuelto, el codificable de arriba es una estructura y toma
    /// el camino de JSON.
    @Field(key: "rings") var rings: Contorno
    @Field(key: "min_lat") var minLat: Double
    @Field(key: "max_lat") var maxLat: Double
    @Field(key: "min_long") var minLong: Double
    @Field(key: "max_long") var maxLong: Double

    /// El envoltorio que obliga a JSON. Ver el comentario de `rings`.
    struct Contorno: Codable, @unchecked Sendable {
        let multiPolygon: [[[[Double]]]]
    }

    init() {}

    init(ine: String, name: String, rings: [[[[Double]]]],
         minLat: Double, maxLat: Double, minLong: Double, maxLong: Double) {
        self.id = ine
        self.name = name
        self.rings = Contorno(multiPolygon: rings)
        self.minLat = minLat
        self.maxLat = maxLat
        self.minLong = minLong
        self.maxLong = maxLong
    }
}
