[out:json][timeout:900];
area["ISO3166-1"="CZ"][admin_level=2]->.no;
(
  node["amenity"="drinking_water"]["access"!~"^(no|private)$"](area.no)(48.5,12.0,51.1,18.9);
  node["man_made"="water_tap"]["access"!~"^(no|private)$"](area.no)(48.5,12.0,51.1,18.9);
  node["natural"="spring"]["drinking_water"]["access"!~"^(no|private)$"](area.no)(48.5,12.0,51.1,18.9);
  node["natural"="spring"]["name"]["access"!~"^(no|private)$"](area.no)(48.5,12.0,51.1,18.9);
  node["natural"="spring"]["man_made"]["access"!~"^(no|private)$"](area.no)(48.5,12.0,51.1,18.9);
);
out body;
