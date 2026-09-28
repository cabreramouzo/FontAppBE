[out:json][timeout:900];
area["ISO3166-1"="DK"][admin_level=2]->.no;
(
  node["amenity"="drinking_water"]["access"!~"^(no|private)$"](area.no)(54.5,8.0,57.8,15.3);
  node["man_made"="water_tap"]["access"!~"^(no|private)$"](area.no)(54.5,8.0,57.8,15.3);
  node["natural"="spring"]["drinking_water"]["access"!~"^(no|private)$"](area.no)(54.5,8.0,57.8,15.3);
  node["natural"="spring"]["name"]["access"!~"^(no|private)$"](area.no)(54.5,8.0,57.8,15.3);
  node["natural"="spring"]["man_made"]["access"!~"^(no|private)$"](area.no)(54.5,8.0,57.8,15.3);
);
out body;
