<?php
return [
	"type" => "object",
	"properties" => [
		"annotations" => [
			"type" => "array",
			"items" => [
				[
					"type" => "object",
					"properties" => [
						"content" => [
							"type" => "string",
							"required" => true
						],
						"x" => [
							"type" => "number"
						],
						"y" => [
							"type" => "number"
						],
						"width" => [
							"type" => "number"
						],
						"height" => [
							"type" => "number"
						]
					]
				]
			]
		]
	]
];
