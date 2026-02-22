{
    "targets": [
        {
            "target_name": "holy_grail",
            "sources": ["src/addon.cc"],
            "include_dirs": [
                "<!@(node -p \"require('node-addon-api').include\")"
            ],
            "defines": [
                "NAPI_DISABLE_CPP_EXCEPTIONS",
                "UNICODE",
                "_UNICODE"
            ],
            "conditions": [
                ["OS=='win'", {
                    "libraries": [
                        "d3d11.lib",
                        "dxgi.lib"
                    ]
                }]
            ]
        }
    ]
}
