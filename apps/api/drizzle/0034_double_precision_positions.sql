-- Positions were float4 (about 7 significant digits), so a few drops between the same two cards made their midpoints
-- meet and the order broke. Widening to float8 keeps every value exactly, and so the order.
ALTER TABLE "issues" ALTER COLUMN "position" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "board_columns" ALTER COLUMN "position" SET DATA TYPE double precision;--> statement-breakpoint
-- Cards that already collided share a position and show in number order. Spread each project's order 1000 apart,
-- keeping the order the list and the board show (position, then number), so they can be told apart again.
UPDATE "issues" AS "target"
SET "position" = "ranked"."rank" * 1000
FROM (
	SELECT "id", row_number() OVER (PARTITION BY "project_id" ORDER BY "position", "number") AS "rank"
	FROM "issues"
) AS "ranked"
WHERE "target"."id" = "ranked"."id";--> statement-breakpoint
-- Columns too, with the oldest first where two share a position.
UPDATE "board_columns" AS "target"
SET "position" = "ranked"."rank" * 1000
FROM (
	SELECT "id", row_number() OVER (PARTITION BY "project_id" ORDER BY "position", "created_at", "id") AS "rank"
	FROM "board_columns"
) AS "ranked"
WHERE "target"."id" = "ranked"."id";
