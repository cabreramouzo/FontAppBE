[out:json][timeout:540];
area["ISO3166-1"="NO"][admin_level=2]->.no;
(
  node["amenity"="drinking_water"]["access"!~"^(no|private)$"](area.no);
  node["man_made"="water_tap"]["access"!~"^(no|private)$"](area.no);
  node["natural"="spring"]["drinking_water"]["access"!~"^(no|private)$"](area.no);
  node["natural"="spring"]["name"]["access"!~"^(no|private)$"](area.no);
  node["natural"="spring"]["man_made"]["access"!~"^(no|private)$"](area.no);
);
out body;
