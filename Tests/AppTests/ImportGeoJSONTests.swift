import XCTest
@testable import App

/// El dataset de la ACA (CercaFonts) viene con los nombres EN MAYÚSCULAS.
final class ImportGeoJSONTests: XCTestCase {
    func testTitleCasedRespectsCatalanToponyms() {
        XCTAssertEqual(ImportGeoJSONCommand.titleCased("FONT DE LA VALLMITJANA"), "Font de la Vallmitjana")
        XCTAssertEqual(ImportGeoJSONCommand.titleCased("FONT D'EN PALOT"), "Font d'En Palot")
        XCTAssertEqual(ImportGeoJSONCommand.titleCased("FONT DES TET MONT"), "Font des Tet Mont")
        XCTAssertEqual(ImportGeoJSONCommand.titleCased("BASSA DE CA L'ESTIU O DEL REVOLT"), "Bassa de ca l'Estiu o del Revolt")
        // La primera palabra siempre en mayúscula, aunque sea artículo.
        XCTAssertEqual(ImportGeoJSONCommand.titleCased("LA FONT GRAN"), "La Font Gran")
        // Si alguien ya lo escribió bien, no se toca.
        XCTAssertEqual(ImportGeoJSONCommand.titleCased("Font de la Quintana"), "Font de la Quintana")
        // Los inventarios numeran con romanos los manantiales de un mismo paraje. En Tipo
        // Título salían «Peña Ii», que no es un topónimo sino una errata: uno de cada
        // cuatro nombres de la capa de Navarra (1.909 de 8.473).
        XCTAssertEqual(ImportGeoJSONCommand.titleCased("PEÑA II"), "Peña II")
        XCTAssertEqual(ImportGeoJSONCommand.titleCased("ARICHULEGUI III"), "Arichulegui III")
        XCTAssertEqual(ImportGeoJSONCommand.titleCased("IRATI IV"), "Irati IV")
        // Pero la «i» catalana NO es un ordinal: es conjunción y se queda en minúscula.
        // Se paga que un «CHOKOA I» suelto salga «Chokoa i», que es mucho menos malo que
        // romper todos los topónimos con «i» del ICGC.
        XCTAssertEqual(ImportGeoJSONCommand.titleCased("SANT PERE I SANT PAU"), "Sant Pere i Sant Pau")
    }
}

/// La rejilla del dedupe del importador.
///
/// Antes esto era `existing.first(where:)`: un barrido lineal por cada punto del fichero,
/// o sea miles de millones de haversines al importar un país. La rejilla lo arregla, pero
/// trae una regla que **falla en silencio** — duplicar fuentes no da ningún error— y por
/// eso está aquí.
final class RejillaCercaniaTests: XCTestCase {
    private func rejilla(_ puntos: [(Double, Double)]) -> RejillaCercania {
        var r = RejillaCercania()
        for (lat, lon) in puntos {
            r.añade(RejillaCercania.Vecina(id: UUID(), lat: lat, lon: lon, name: nil))
        }
        return r
    }

    func testFindsANeighbourWithinTheRadius() {
        let r = rejilla([(41.7500, 2.1600)])
        // A ~22 m: dentro de 50.
        XCTAssertNotNil(r.cercana(41.7502, 2.1600, 0.05))
        // A ~1,1 km: fuera.
        XCTAssertNil(r.cercana(41.7600, 2.1600, 0.05))
    }

    func testLooksBeyondItsOwnCell() {
        // Dos puntos a 60 m pero en celdas distintas: el borde de celda cae en .00 exacto,
        // así que mirando solo la celda propia esta vecina no se vería.
        let r = rejilla([(41.7499, 2.1600)])
        XCTAssertNotNil(r.cercana(41.7501, 2.1600, 0.1), "no mira las celdas de al lado")
    }

    /// **La regla del coseno**, que es la que costó una prueba entera.
    ///
    /// Un grado de longitud mide menos según subes en latitud, así que el número de celdas
    /// que hay que mirar a los lados no es el mismo que en latitud. Sin corregirlo, a 68°
    /// con `--dedupe 2000` los 200 duplicados de la prueba entraban **todos** como fuentes
    /// nuevas: ningún error, 200 fuentes de más.
    func testWidensTheSearchAsLongitudeDegreesShrink() {
        let r = rejilla([(68.0, 20.0)])
        // 0,03° de longitud a 68° son ~1,25 km: dentro de un radio de 2 km.
        let separacionKm = haversineKm(68.0, 20.0, 68.0, 20.03)
        XCTAssertLessThan(separacionKm, 2.0, "la prueba no vale si el punto no está dentro del radio")
        XCTAssertNotNil(r.cercana(68.0, 20.03, 2.0),
                        "sin corregir por el coseno, esta vecina se escapa y la fuente se duplica")
    }

    /// La misma separación en latitud no necesita corrección: es el control que demuestra
    /// que el test de arriba mide lo que dice medir.
    func testTheEquivalentLatitudeGapIsFoundToo() {
        let r = rejilla([(68.0, 20.0)])
        XCTAssertNotNil(r.cercana(68.011, 20.0, 2.0))
    }

    func testReturnsTheFirstInserted() {
        // Determinismo: reproduce el `first(where:)` que había, así que reimportar el
        // mismo fichero da el mismo resultado.
        var r = RejillaCercania()
        for i in 0..<3 {
            r.añade(RejillaCercania.Vecina(id: UUID(), lat: 41.75 + Double(i) / 100_000, lon: 2.16, name: nil))
        }
        XCTAssertEqual(r.cercana(41.75, 2.16, 0.05), 0)
    }

    func testAnEmptyGridFindsNothing() {
        XCTAssertNil(RejillaCercania().cercana(41.75, 2.16, 5))
    }

    func testRenamingIsVisibleToLaterLookups() {
        // El nombre se cambia en memoria también en el ensayo en seco: sin eso, un segundo
        // punto del origen junto a la misma fuente la vería aún genérica y contaría otro
        // renombrado que en la importación real no ocurre.
        var r = RejillaCercania()
        r.añade(RejillaCercania.Vecina(id: UUID(), lat: 41.75, lon: 2.16, name: "Font"))
        let i = try! XCTUnwrap(r.cercana(41.75, 2.16, 0.05))
        r.renombra(i, "Font de la Vallmitjana")
        XCTAssertEqual(r.vecinas[i].name, "Font de la Vallmitjana")
    }
}
