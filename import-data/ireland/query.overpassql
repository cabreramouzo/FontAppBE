[out:json][timeout:900];
area["ISO3166-1"="IE"][admin_level=2]->.no;
(
  node["amenity"="drinking_water"]["access"!~"^(no|private)$"](area.no)(51.3,-10.8,55.5,-5.9);
  node["man_made"="water_tap"]["access"!~"^(no|private)$"](area.no)(51.3,-10.8,55.5,-5.9);
  node["natural"="spring"]["drinking_water"]["access"!~"^(no|private)$"](area.no)(51.3,-10.8,55.5,-5.9);
  node["natural"="spring"]["name"]["access"!~"^(no|private)$"](area.no)(51.3,-10.8,55.5,-5.9);
  node["natural"="spring"]["man_made"]["access"!~"^(no|private)$"](area.no)(51.3,-10.8,55.5,-5.9);
);
out body;
