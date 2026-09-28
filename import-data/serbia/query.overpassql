[out:json][timeout:900];
area["ISO3166-1"="RS"][admin_level=2]->.no;
(
  node["amenity"="drinking_water"]["access"!~"^(no|private)$"](area.no)(42.2,18.8,46.2,23.0);
  node["man_made"="water_tap"]["access"!~"^(no|private)$"](area.no)(42.2,18.8,46.2,23.0);
  node["natural"="spring"]["drinking_water"]["access"!~"^(no|private)$"](area.no)(42.2,18.8,46.2,23.0);
  node["natural"="spring"]["name"]["access"!~"^(no|private)$"](area.no)(42.2,18.8,46.2,23.0);
  node["natural"="spring"]["man_made"]["access"!~"^(no|private)$"](area.no)(42.2,18.8,46.2,23.0);
);
out body;
