/* Copyright 2023 Google LLC. All Rights Reserved.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
==============================================================================*/

var hyper = {
    "n_num_tokens": 10,
    "sequence_length": 7,
    "num_layers": 2,
    "num_heads": 1,
    "key_size": 10,
    "namedIndices": {
        "is_left": [
            0
        ],
        "is_num": [
            1
        ],
        "continuous_num": [
            2
        ],
        "one_hot_num": [
            3,
            4,
            5,
            6,
            7,
            8,
            9,
            10,
            11,
            12
        ],
        "left_count": [
            13
        ],
        "smaller_count": [
            14
        ]
    },
    "indToName": [
        {
            "key": "is_left",
            "j": 0
        },
        {
            "key": "is_num",
            "j": 0
        },
        {
            "key": "continuous_num",
            "j": 0
        },
        {
            "key": "one_hot_num",
            "j": 0
        },
        {
            "key": "one_hot_num",
            "j": 1
        },
        {
            "key": "one_hot_num",
            "j": 2
        },
        {
            "key": "one_hot_num",
            "j": 3
        },
        {
            "key": "one_hot_num",
            "j": 4
        },
        {
            "key": "one_hot_num",
            "j": 5
        },
        {
            "key": "one_hot_num",
            "j": 6
        },
        {
            "key": "one_hot_num",
            "j": 7
        },
        {
            "key": "one_hot_num",
            "j": 8
        },
        {
            "key": "one_hot_num",
            "j": 9
        },
        {
            "key": "left_count",
            "j": 0
        },
        {
            "key": "smaller_count",
            "j": 0
        }
    ],
    "vocab_size": 12,
    "model_size": 15
}