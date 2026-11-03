-- Profile backgrounds were removed from the app, so their uploaded images go too. Profiles may keep a stale
-- "background" key in their JSON; the Worker ignores it.
DROP TABLE IF EXISTS banner_images;
