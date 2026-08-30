import Fluent
import Vapor

/// En qué municipio cae un punto, resuelto contra `municipal_boundaries`.
///
/// ## Por qué ahora sí se puede, y antes no
///
/// `inheritZone` heredaba país y demarcación de la fuente clasificada más cercana, y su
/// comentario explicaba por qué no se resolvía contra las fronteras de verdad: habría
/// obligado a llevar un GeoJSON de 13 MB dentro del contenedor y tenerlo en memoria para
/// usarlo cuatro veces al día. **Eso dejó de ser cierto** cuando los contornos entraron en
/// la base para poder dibujar el mapa de un municipio: ahora clasificar un punto es una
/// consulta por caja —que usa las columnas `min_/max_` que ya están— y un point-in-polygon
/// sobre un puñado de candidatos.
///
/// ## Por qué importa que sea derivado y no escrito
///
/// El municipio **no es un campo que alguien rellena**: es el resultado de meter unas
/// coordenadas dentro de un polígono. Si estuviera mal y se pudiera escribir a mano,
/// tendríamos fuentes que dicen «Moià» pintadas dentro de Castellcir, y dos verdades que
/// se contradicen en `/zones`, en el ranking y en la página del municipio. Cuando el
/// municipio está mal es casi siempre porque **el pin está mal**, y eso ya se corrige
/// moviéndolo — lo que faltaba era que al moverlo se recalculara, que es justo esto.
///
/// Usa **la misma función** de point-in-polygon que `populate-municipalities`
/// (`dentro`), y a propósito: con dos implementaciones, el municipio que se dibuja y el
/// que se guarda podrían discrepar en un borde y no habría forma de saber cuál miente.
enum Municipalities {
    struct Resuelto: Sendable { let ine: String; let name: String }

    static func resolve(lat: Double, long: Double, on db: any Database) async throws -> Resuelto? {
        // La caja descarta casi todo sin tocar la geometría: de 8.219 municipios quedan
        // uno o dos candidatos, y el índice de la clave primaria no ayuda aquí.
        let candidatos = try await MunicipalBoundary.query(on: db)
            .filter(\.$minLat <= lat).filter(\.$maxLat >= lat)
            .filter(\.$minLong <= long).filter(\.$maxLong >= long)
            .all()

        for m in candidatos {
            let anillos: [[(Double, Double)]] = m.rings.multiPolygon.flatMap { poligono in
                poligono.map { anillo in anillo.compactMap { p -> (Double, Double)? in
                    p.count >= 2 ? (p[0], p[1]) : nil
                } }
            }
            if PopulateMunicipalitiesCommand.dentro(lat: lat, long: long, anillos: anillos) {
                return Resuelto(ine: m.id ?? "", name: m.name)
            }
        }
        // Fuera de España no hay contornos, y eso **no es un error**: se deja nulo, que
        // significa «no lo sabemos», y no se hereda del vecino como el país o la
        // demarcación. Un municipio heredado sería inventarse una respuesta exacta a
        // partir de una aproximación.
        return nil
    }

    /// Recalcula y guarda el municipio de una fuente. Silencioso: es un dato derivado y
    /// no puede costarle a nadie el alta ni la corrección de un pin.
    static func refresh(fontID: UUID, lat: Double, long: Double, db: any Database, logger: Logger) async {
        do {
            let m = try await resolve(lat: lat, long: long, on: db)
            guard let font = try await Font.find(fontID, on: db) else { return }
            font.municipality = m?.name
            font.municipalityINE = m?.ine
            try await font.save(on: db)
        } catch {
            logger.warning("No s'ha pogut resoldre el municipi de la font \(fontID): \(error)")
        }
    }
}
