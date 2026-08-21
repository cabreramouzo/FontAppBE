import Foundation

/// Traduce la demarcación fina que ya guarda FontApp a su división administrativa
/// superior. Las claves son exactamente los valores medidos en producción.
///
/// No se infiere por geometría: una provincia pertenece a una comunidad por definición.
/// Si entra un valor nuevo, queda sin clasificar hasta añadirlo explícitamente; inventar
/// aquí sería peor que devolver `nil`.
enum Admin1 {
    static func code(country: String?, region: String?) -> String? {
        guard let country, let region else { return nil }
        return byCountry[country]?[region]
    }

    static let byCountry: [String: [String: String]] = [
        "Andorra": [
            "Andorra la Vella": "AD-07", "Canillo": "AD-02", "Encamp": "AD-03",
            "Escaldes-Engordany": "AD-08", "La Massana": "AD-04", "Ordino": "AD-05",
            "Sant Julià de Lòria": "AD-06",
        ],
        "Chile": [
            "Aisén del General Carlos Ibáñez del Campo": "CL-AI", "Antofagasta": "CL-AN",
            "Arica y Parinacota": "CL-AP", "Atacama": "CL-AT", "Bío-Bío": "CL-BI",
            "Coquimbo": "CL-CO", "La Araucanía": "CL-AR",
            "Libertador General Bernardo O'Higgins": "CL-LI", "Los Lagos": "CL-LL",
            "Los Ríos": "CL-LR", "Magallanes y Antártica Chilena": "CL-MA",
            "Maule": "CL-ML", "Región Metropolitana de Santiago": "CL-RM",
            "Valparaíso": "CL-VS", "Ñuble": "CL-NB",
        ],
        "Finland": [
            "Central Finland": "FI-08", "Central Ostrobothnia": "FI-07",
            "Finland Proper": "FI-19", "Kainuu": "FI-05", "Kymenlaakso": "FI-09",
            "Lapland": "FI-10", "North Karelia": "FI-13", "Northern Ostrobothnia": "FI-14",
            "Northern Savonia": "FI-15", "Ostrobothnia": "FI-12", "Pirkanmaa": "FI-11",
            "Päijät-Häme": "FI-16", "Satakunta": "FI-17", "South Karelia": "FI-02",
            "Southern Ostrobothnia": "FI-03", "Southern Savonia": "FI-04",
            "Tavastia Proper": "FI-06", "Uusimaa": "FI-18", "Åland": "FI-01",
        ],
        "France": [
            "Ardèche": "FR-ARA", "Ariège": "FR-OCC", "Aude": "FR-OCC",
            "Aveyron": "FR-OCC", "Bouches-du-Rhône": "FR-PAC", "Cantal": "FR-ARA",
            "Corrèze": "FR-NAQ", "Dordogne": "FR-NAQ", "Drôme": "FR-ARA",
            "Gard": "FR-OCC", "Gers": "FR-OCC", "Gironde": "FR-NAQ",
            "Haute-Garonne": "FR-OCC", "Haute-Loire": "FR-ARA",
            "Hautes-Pyrénées": "FR-OCC", "Hérault": "FR-OCC", "Landes": "FR-NAQ",
            "Lot": "FR-OCC", "Lot-et-Garonne": "FR-NAQ", "Lozère": "FR-OCC",
            "Pyrénées-Atlantiques": "FR-NAQ", "Pyrénées-Orientales": "FR-OCC",
            "Tarn": "FR-OCC", "Tarn-et-Garonne": "FR-OCC", "Vaucluse": "FR-PAC",
        ],
        "Portugal": [
            "Aveiro": "PT-01", "Azores": "PT-20", "Beja": "PT-02", "Braga": "PT-03",
            "Bragança": "PT-04", "Castelo Branco": "PT-05", "Coimbra": "PT-06",
            "Faro": "PT-08", "Guarda": "PT-09", "Leiria": "PT-10", "Lisboa": "PT-11",
            "Madeira": "PT-30", "Portalegre": "PT-12", "Porto": "PT-13",
            "Santarém": "PT-14", "Setúbal": "PT-15", "Viana do Castelo": "PT-16",
            "Vila Real": "PT-17", "Viseu": "PT-18", "Évora": "PT-07",
        ],
        "Spain": [
            "Albacete": "ES-CM", "Alicante": "ES-VC", "Almería": "ES-AN",
            "Asturias": "ES-AS", "Badajoz": "ES-EX", "Baleares": "ES-IB",
            "Barcelona": "ES-CT", "Bizkaia": "ES-PV", "Burgos": "ES-CL",
            "Cantabria": "ES-CB", "Castellón": "ES-VC", "Ceuta": "ES-CE",
            "Ciudad Real": "ES-CM", "Cuenca": "ES-CM", "Cáceres": "ES-EX",
            "Cádiz": "ES-AN", "Córdoba": "ES-AN", "Gipuzkoa": "ES-PV",
            "Gerona": "ES-CT", "Girona": "ES-CT", "Granada": "ES-AN", "Guadalajara": "ES-CM",
            "Huelva": "ES-AN", "Huesca": "ES-AR", "Jaén": "ES-AN",
            "La Coruña": "ES-GA", "La Rioja": "ES-RI", "Las Palmas": "ES-CN",
            "León": "ES-CL", "Lérida": "ES-CT", "Lleida": "ES-CT", "Lugo": "ES-GA",
            "Madrid": "ES-MD",
            "Melilla": "ES-ML", "Murcia": "ES-MC", "Málaga": "ES-AN",
            "Navarra": "ES-NC", "Orense": "ES-GA", "Palencia": "ES-CL",
            "Pontevedra": "ES-GA", "Salamanca": "ES-CL", "Santa Cruz de Tenerife": "ES-CN",
            "Segovia": "ES-CL", "Sevilla": "ES-AN", "Soria": "ES-CL",
            "Tarragona": "ES-CT", "Teruel": "ES-AR", "Toledo": "ES-CM",
            "Valencia": "ES-VC", "Valladolid": "ES-CL", "Zamora": "ES-CL",
            "Zaragoza": "ES-AR", "Álava": "ES-PV", "Ávila": "ES-CL",
        ],
        "Sweden": [
            "Blekinge": "SE-K", "Dalarna": "SE-W", "Gotland": "SE-I",
            "Gävleborg": "SE-X", "Halland": "SE-N", "Jämtland": "SE-Z",
            "Jönköping": "SE-F", "Kalmar": "SE-H", "Kronoberg": "SE-G",
            "Norrbotten": "SE-BD", "Orebro": "SE-T", "Skåne": "SE-M",
            "Stockholm": "SE-AB", "Södermanland": "SE-D", "Uppsala": "SE-C",
            "Värmland": "SE-S", "Västerbotten": "SE-AC", "Västernorrland": "SE-Y",
            "Västmanland": "SE-U", "Västra Götaland": "SE-O", "Östergötland": "SE-E",
        ],
        "Switzerland": [
            "Aargau": "CH-AG", "Appenzell Ausserrhoden": "CH-AR",
            "Appenzell Innerrhoden": "CH-AI", "Basel-Landschaft": "CH-BL",
            "Basel-Stadt": "CH-BS", "Bern": "CH-BE", "Fribourg": "CH-FR",
            "Genève": "CH-GE", "Glarus": "CH-GL", "Graubünden": "CH-GR",
            "Jura": "CH-JU", "Lucerne": "CH-LU", "Neuchâtel": "CH-NE",
            "Nidwalden": "CH-NW", "Obwalden": "CH-OW", "Sankt Gallen": "CH-SG",
            "Schaffhausen": "CH-SH", "Schwyz": "CH-SZ", "Solothurn": "CH-SO",
            "Thurgau": "CH-TG", "Ticino": "CH-TI", "Uri": "CH-UR",
            "Valais": "CH-VS", "Vaud": "CH-VD", "Zug": "CH-ZG", "Zürich": "CH-ZH",
        ],
    ]
}
