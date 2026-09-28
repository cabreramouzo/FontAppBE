[out:json][timeout:900];
area["ISO3166-1"="HR"][admin_level=2]->.no;
(
  node["amenity"="drinking_water"]["access"!~"^(no|private)$"](area.no)(42.3,13.4,46.6,19.5);
  node["man_made"="water_tap"]["access"!~"^(no|private)$"](area.no)(42.3,13.4,46.6,19.5);
  node["natural"="spring"]["drinking_water"]["access"!~"^(no|private)$"](area.no)(42.3,13.4,46.6,19.5);
  node["natural"="spring"]["name"]["access"!~"^(no|private)$"](area.no)(42.3,13.4,46.6,19.5);
  node["natural"="spring"]["man_made"]["access"!~"^(no|private)$"](area.no)(42.3,13.4,46.6,19.5);
);
out body;
