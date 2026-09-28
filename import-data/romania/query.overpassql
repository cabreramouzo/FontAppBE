[out:json][timeout:900];
area["ISO3166-1"="RO"][admin_level=2]->.no;
(
  node["amenity"="drinking_water"]["access"!~"^(no|private)$"](area.no)(43.6,20.2,48.3,29.8);
  node["man_made"="water_tap"]["access"!~"^(no|private)$"](area.no)(43.6,20.2,48.3,29.8);
  node["natural"="spring"]["drinking_water"]["access"!~"^(no|private)$"](area.no)(43.6,20.2,48.3,29.8);
  node["natural"="spring"]["name"]["access"!~"^(no|private)$"](area.no)(43.6,20.2,48.3,29.8);
  node["natural"="spring"]["man_made"]["access"!~"^(no|private)$"](area.no)(43.6,20.2,48.3,29.8);
);
out body;
