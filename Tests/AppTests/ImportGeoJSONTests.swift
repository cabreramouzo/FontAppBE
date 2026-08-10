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
    }
}
