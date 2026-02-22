/*
 * mpv Holy Grail — Native Addon (Phase 2a: D3D11 Texture PoC)
 *
 * Creates a D3D11 texture with a shared NT handle, fills it with a solid
 * color, and returns the handle for Electron's sharedTexture module.
 *
 * No mpv, no ANGLE — just proving the GPU texture pipeline works.
 */

#include <napi.h>
#include <d3d11.h>
#include <d3d11_1.h>
#include <dxgi1_2.h>
#include <wrl/client.h>
#include <cstdint>
#include <string>

using Microsoft::WRL::ComPtr;

// ── Global state ───────────────────────────────────────────────────
static ComPtr<ID3D11Device>        g_device;
static ComPtr<ID3D11DeviceContext>  g_context;
static ComPtr<ID3D11Texture2D>     g_texture;
static HANDLE                       g_sharedHandle = nullptr;
static uint32_t                     g_width  = 0;
static uint32_t                     g_height = 0;

// Helper: format HRESULT as hex string for error messages
static std::string HrToString(HRESULT hr) {
    char buf[32];
    snprintf(buf, sizeof(buf), "0x%08lX", (unsigned long)hr);
    return std::string(buf);
}

// ── init(width, height) ────────────────────────────────────────────
// Creates a D3D11 device and a shared texture.
// Returns true on success.
Napi::Value Init(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 2) {
        Napi::TypeError::New(env, "init(width, height) requires 2 args")
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }

    uint32_t width  = info[0].As<Napi::Number>().Uint32Value();
    uint32_t height = info[1].As<Napi::Number>().Uint32Value();

    // ── 1. Create D3D11 device ─────────────────────────────────────
    UINT createFlags = D3D11_CREATE_DEVICE_BGRA_SUPPORT;
#ifdef _DEBUG
    createFlags |= D3D11_CREATE_DEVICE_DEBUG;
#endif

    D3D_FEATURE_LEVEL featureLevel;
    HRESULT hr = D3D11CreateDevice(
        nullptr,                    // default adapter
        D3D_DRIVER_TYPE_HARDWARE,
        nullptr,                    // no software rasterizer
        createFlags,
        nullptr, 0,                 // default feature levels
        D3D11_SDK_VERSION,
        &g_device,
        &featureLevel,
        &g_context
    );
    if (FAILED(hr)) {
        Napi::Error::New(env,
            "D3D11CreateDevice failed: " + HrToString(hr))
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }

    // ── 2. Create texture with shared NT handle ────────────────────
    D3D11_TEXTURE2D_DESC desc = {};
    desc.Width            = width;
    desc.Height           = height;
    desc.MipLevels        = 1;
    desc.ArraySize        = 1;
    desc.Format           = DXGI_FORMAT_B8G8R8A8_UNORM;   // BGRA — ANGLE + Electron standard
    desc.SampleDesc.Count = 1;
    desc.Usage            = D3D11_USAGE_DEFAULT;
    desc.BindFlags        = D3D11_BIND_RENDER_TARGET | D3D11_BIND_SHADER_RESOURCE;
    desc.MiscFlags        = D3D11_RESOURCE_MISC_SHARED_NTHANDLE
                          | D3D11_RESOURCE_MISC_SHARED_KEYEDMUTEX;

    hr = g_device->CreateTexture2D(&desc, nullptr, &g_texture);
    if (FAILED(hr)) {
        Napi::Error::New(env,
            "CreateTexture2D failed: " + HrToString(hr))
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }

    // ── 3. Export NT shared handle ─────────────────────────────────
    ComPtr<IDXGIResource1> dxgiResource;
    hr = g_texture.As(&dxgiResource);
    if (FAILED(hr)) {
        Napi::Error::New(env,
            "QueryInterface IDXGIResource1 failed: " + HrToString(hr))
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }

    hr = dxgiResource->CreateSharedHandle(
        nullptr,                    // default security
        DXGI_SHARED_RESOURCE_READ | DXGI_SHARED_RESOURCE_WRITE,
        nullptr,                    // unnamed handle
        &g_sharedHandle
    );
    if (FAILED(hr)) {
        Napi::Error::New(env,
            "CreateSharedHandle failed: " + HrToString(hr))
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }

    g_width  = width;
    g_height = height;

    return Napi::Boolean::New(env, true);
}

// ── fillColor(r, g, b, a) ─────────────────────────────────────────
// Clears the texture to a solid RGBA color (0.0–1.0 per channel).
// Acquires/releases the keyed mutex for proper synchronization.
Napi::Value FillColor(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (!g_texture) {
        Napi::Error::New(env, "No texture — call init() first")
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }

    float r = info[0].As<Napi::Number>().FloatValue();
    float g = info[1].As<Napi::Number>().FloatValue();
    float b = info[2].As<Napi::Number>().FloatValue();
    float a = info.Length() > 3 ? info[3].As<Napi::Number>().FloatValue() : 1.0f;

    // Acquire keyed mutex before writing
    ComPtr<IDXGIKeyedMutex> mutex;
    HRESULT hr = g_texture.As(&mutex);
    if (FAILED(hr)) {
        Napi::Error::New(env,
            "QueryInterface IDXGIKeyedMutex failed: " + HrToString(hr))
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }

    hr = mutex->AcquireSync(0, 5000);
    if (FAILED(hr)) {
        Napi::Error::New(env,
            "AcquireSync failed: " + HrToString(hr))
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }

    // Clear to color via render target view
    ComPtr<ID3D11RenderTargetView> rtv;
    hr = g_device->CreateRenderTargetView(g_texture.Get(), nullptr, &rtv);
    if (SUCCEEDED(hr)) {
        float color[4] = { r, g, b, a };
        g_context->ClearRenderTargetView(rtv.Get(), color);
        g_context->Flush();
    }

    mutex->ReleaseSync(0);

    if (FAILED(hr)) {
        Napi::Error::New(env,
            "CreateRenderTargetView failed: " + HrToString(hr))
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }

    return Napi::Boolean::New(env, true);
}

// ── getHandle() ────────────────────────────────────────────────────
// Returns the NT shared handle as an 8-byte Buffer.
// This is what Electron's sharedTexture.importSharedTexture() expects.
Napi::Value GetHandle(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (!g_sharedHandle) {
        return env.Null();
    }

    auto buf = Napi::Buffer<uint8_t>::New(env, sizeof(uintptr_t));
    uintptr_t val = reinterpret_cast<uintptr_t>(g_sharedHandle);
    memcpy(buf.Data(), &val, sizeof(uintptr_t));

    return buf;
}

// ── getSize() ──────────────────────────────────────────────────────
Napi::Value GetSize(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    auto obj = Napi::Object::New(env);
    obj.Set("width",  Napi::Number::New(env, g_width));
    obj.Set("height", Napi::Number::New(env, g_height));
    return obj;
}

// ── destroy() ──────────────────────────────────────────────────────
Napi::Value Destroy(const Napi::CallbackInfo& info) {
    if (g_sharedHandle) {
        CloseHandle(g_sharedHandle);
        g_sharedHandle = nullptr;
    }
    g_texture.Reset();
    g_context.Reset();
    g_device.Reset();
    g_width = g_height = 0;
    return info.Env().Undefined();
}

// ── Module init ────────────────────────────────────────────────────
Napi::Object InitModule(Napi::Env env, Napi::Object exports) {
    exports.Set("init",      Napi::Function::New(env, Init));
    exports.Set("fillColor", Napi::Function::New(env, FillColor));
    exports.Set("getHandle", Napi::Function::New(env, GetHandle));
    exports.Set("getSize",   Napi::Function::New(env, GetSize));
    exports.Set("destroy",   Napi::Function::New(env, Destroy));
    return exports;
}

NODE_API_MODULE(holy_grail, InitModule)
