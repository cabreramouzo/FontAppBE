[out:json][timeout:900];
area["ISO3166-1"="JP"][admin_level=2]->.no;
(
  node["amenity"="drinking_water"]["access"!~"^(no|private)$"](area.no)(24.0,122.9,45.6,153.99);
  node["man_made"="water_tap"]["access"!~"^(no|private)$"](area.no)(24.0,122.9,45.6,153.99);
  node["natural"="spring"]["drinking_water"]["access"!~"^(no|private)$"](area.no)(24.0,122.9,45.6,153.99);
  node["natural"="spring"]["name"]["access"!~"^(no|private)$"](area.no)(24.0,122.9,45.6,153.99);
  node["natural"="spring"]["man_made"]["access"!~"^(no|private)$"](area.no)(24.0,122.9,45.6,153.99);
);
out body;
