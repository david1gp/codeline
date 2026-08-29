UPDATE `project`
SET `id` = lower(
	substr(printf('%012x', CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)), 1, 8)
	|| '-'
	|| substr(printf('%012x', CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)), 9, 4)
	|| '-7'
	|| substr(hex(randomblob(2)), 2, 3)
	|| '-'
	|| printf('%02x', (random() & 63) | 128)
	|| substr(hex(randomblob(2)), 3, 2)
	|| '-'
	|| hex(randomblob(6))
)
WHERE NOT (
	length(`id`) = 36
	AND substr(`id`, 9, 1) = '-'
	AND substr(`id`, 14, 1) = '-'
	AND lower(substr(`id`, 15, 1)) = '7'
	AND substr(`id`, 19, 1) = '-'
	AND lower(substr(`id`, 20, 1)) IN ('8', '9', 'a', 'b')
	AND substr(`id`, 24, 1) = '-'
	AND `id` = lower(`id`)
	AND `id` NOT GLOB '*[^0-9a-f-]*'
	AND length(`id`) - length(replace(`id`, '-', '')) = 4
);
