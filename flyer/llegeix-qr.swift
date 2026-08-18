// Llegeix els codis QR d'un cartell i diu a on porten.
//
// Serveix per comprovar que cada poble té el SEU codi de campanya. Fa falta perquè
// l'adreça impresa és `fontapp.net` a seques: el codi (`?p=castelltercol`) viatja només
// dins del QR, així que si un QR surt malament aquell poble deixa de comptar al panell
// i no hi ha cap altra manera d'adonar-se'n.
//
// Fa servir **Vision**, el framework del sistema, i no la llibreria que dibuixa els QR
// (`segno`). Això és el que li dona valor: comparar el que genera segno amb el que llegeix
// segno no demostra res, perquè un error el tindrien tots dos. Aquí decodifica un altre.
//
// Llegeix PDF i imatges. Millor el PDF final, que és el que va a la impremta — així també
// es comprova que la conversió no ha degradat el codi.
//
// Compilar-lo i fer-lo servir:
//
//     swiftc -O flyer/llegeix-qr.swift -o /tmp/llegeix-qr
//     /tmp/llegeix-qr flyer/pobles/*.pdf
//
// No forma part del paquet SwiftPM (els targets només miren `Sources/`), així que
// `swift build` l'ignora.

import AppKit
import Foundation
import Vision

var errors = 0
for ruta in CommandLine.arguments.dropFirst() {
    let nom = (ruta as NSString).lastPathComponent
    guard let img = NSImage(contentsOfFile: ruta),
          let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
        print("✗ \(nom): no s'ha pogut llegir")
        errors += 1
        continue
    }
    let req = VNDetectBarcodesRequest()
    req.symbologies = [.qr]
    try? VNImageRequestHandler(cgImage: cg).perform([req])
    let llegits = (req.results ?? []).compactMap { $0.payloadStringValue }
    if llegits.isEmpty {
        print("✗ \(nom): cap QR llegible")
        errors += 1
    } else {
        print("✓ \(nom) → \(llegits.joined(separator: ", "))")
    }
}
// Codi de sortida ≠ 0 si algun cartell no té QR llegible: així es pot encadenar amb `&&`.
exit(errors == 0 ? 0 : 1)
