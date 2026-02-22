/*
 * mpv Holy Grail — Native Addon (Phase 2b: ANGLE + mpv)
 *
 * Pipeline: mpv → OpenGL (via ANGLE) → D3D11 texture → shared NT handle
 *           → Electron sharedTexture → VideoFrame → Canvas
 *
 * All external DLLs (libmpv, libEGL, libGLESv2) are loaded dynamically.
 * Double-buffer: internal texture (ANGLE renders) → CopyResource → external
 * texture (Electron reads via NT handle). Proven pattern from media-kit.
 */

#include <napi.h>
#include <d3d11.h>
#include <d3d11_1.h>
#include <dxgi1_2.h>
#include <wrl/client.h>
#include <windows.h>
#include <cstdint>
#include <cstring>
#include <string>
#include <atomic>
#include <mutex>

using Microsoft::WRL::ComPtr;

// ═══════════════════════════════════════════════════════════════════
// § 1. EGL TYPES + CONSTANTS (no headers needed — dynamic loading)
// ═══════════════════════════════════════════════════════════════════

typedef void*    EGLDisplay;
typedef void*    EGLContext;
typedef void*    EGLSurface;
typedef void*    EGLConfig;
typedef void*    EGLClientBuffer;
typedef void*    EGLDeviceEXT;
typedef unsigned EGLBoolean;
typedef int32_t  EGLint;
typedef intptr_t EGLAttrib;
typedef void*    EGLNativeDisplayType;

#define EGL_NO_DISPLAY  ((EGLDisplay)0)
#define EGL_NO_CONTEXT  ((EGLContext)0)
#define EGL_NO_SURFACE  ((EGLSurface)0)
#define EGL_TRUE  1
#define EGL_FALSE 0

// Config attribs
#define EGL_RED_SIZE          0x3024
#define EGL_GREEN_SIZE        0x3023
#define EGL_BLUE_SIZE         0x3022
#define EGL_ALPHA_SIZE        0x3021
#define EGL_DEPTH_SIZE        0x3025
#define EGL_STENCIL_SIZE      0x3026
#define EGL_SURFACE_TYPE      0x3033
#define EGL_PBUFFER_BIT       0x0001
#define EGL_RENDERABLE_TYPE   0x3040
#define EGL_OPENGL_ES2_BIT    0x0004
#define EGL_NONE              0x3038
#define EGL_CONTEXT_CLIENT_VERSION 0x3098

// Pbuffer attribs
#define EGL_WIDTH             0x3057
#define EGL_HEIGHT            0x3056
#define EGL_TEXTURE_FORMAT    0x3080
#define EGL_TEXTURE_TARGET    0x3081
#define EGL_TEXTURE_RGBA      0x305E
#define EGL_TEXTURE_2D        0x305F

// ANGLE extensions
#define EGL_PLATFORM_ANGLE_ANGLE                       0x3202
#define EGL_PLATFORM_ANGLE_TYPE_ANGLE                  0x3203
#define EGL_PLATFORM_ANGLE_TYPE_D3D11_ANGLE            0x3208
#define EGL_PLATFORM_ANGLE_ENABLE_AUTOMATIC_TRIM_ANGLE 0x320F
#define EGL_D3D_TEXTURE_2D_SHARE_HANDLE_ANGLE          0x3200
#define EGL_D3D_TEXTURE_ANGLE                          0x33A3
#define EGL_DEVICE_EXT                                 0x322C
#define EGL_D3D11_DEVICE_ANGLE                         0x33A1

// GL constants (minimal set — we only need glFinish + glGetError)
#define GL_NO_ERROR           0
#define GL_RGBA8              0x8058

// ═══════════════════════════════════════════════════════════════════
// § 2. MPV TYPES + CONSTANTS
// ═══════════════════════════════════════════════════════════════════

typedef struct mpv_handle mpv_handle;
typedef struct mpv_render_context mpv_render_context;

enum {
    MPV_FORMAT_NONE   = 0,
    MPV_FORMAT_STRING = 1,
    MPV_FORMAT_FLAG   = 3,
    MPV_FORMAT_INT64  = 4,
    MPV_FORMAT_DOUBLE = 5,
};

enum {
    MPV_RENDER_PARAM_INVALID            = 0,
    MPV_RENDER_PARAM_API_TYPE           = 1,
    MPV_RENDER_PARAM_OPENGL_INIT_PARAMS = 2,
    MPV_RENDER_PARAM_OPENGL_FBO         = 3,
    MPV_RENDER_PARAM_FLIP_Y             = 4,
    MPV_RENDER_PARAM_ADVANCED_CONTROL   = 10,
    MPV_RENDER_PARAM_BLOCK_FOR_TARGET_TIME = 12,
};

#define MPV_RENDER_API_TYPE_OPENGL "opengl"
#define MPV_RENDER_UPDATE_FRAME    1

typedef struct {
    void *(*get_proc_address)(void *ctx, const char *name);
    void *get_proc_address_ctx;
} mpv_opengl_init_params;

typedef struct {
    int fbo;
    int w, h;
    int internal_format;
} mpv_opengl_fbo;

typedef struct {
    int   type;
    void *data;
} mpv_render_param;

// ═══════════════════════════════════════════════════════════════════
// § 3. FUNCTION POINTER TYPES
// ═══════════════════════════════════════════════════════════════════

// ── EGL ──
typedef EGLDisplay (*pfn_eglGetPlatformDisplayEXT)(EGLint, void*, const EGLint*);
typedef EGLBoolean (*pfn_eglInitialize)(EGLDisplay, EGLint*, EGLint*);
typedef EGLBoolean (*pfn_eglChooseConfig)(EGLDisplay, const EGLint*, EGLConfig*, EGLint, EGLint*);
typedef EGLContext  (*pfn_eglCreateContext)(EGLDisplay, EGLConfig, EGLContext, const EGLint*);
typedef EGLSurface  (*pfn_eglCreatePbufferFromClientBuffer)(EGLDisplay, EGLint, EGLClientBuffer, EGLConfig, const EGLint*);
typedef EGLBoolean (*pfn_eglMakeCurrent)(EGLDisplay, EGLSurface, EGLSurface, EGLContext);
typedef void*      (*pfn_eglGetProcAddress)(const char*);
typedef EGLBoolean (*pfn_eglQueryDisplayAttribEXT)(EGLDisplay, EGLint, EGLAttrib*);
typedef EGLBoolean (*pfn_eglQueryDeviceAttribEXT)(EGLDeviceEXT, EGLint, EGLAttrib*);
typedef EGLBoolean (*pfn_eglDestroyContext)(EGLDisplay, EGLContext);
typedef EGLBoolean (*pfn_eglDestroySurface)(EGLDisplay, EGLSurface);
typedef EGLBoolean (*pfn_eglTerminate)(EGLDisplay);
typedef EGLint     (*pfn_eglGetError)(void);

// ── GLES ──
typedef void       (*pfn_glFinish)(void);
typedef unsigned   (*pfn_glGetError)(void);

// ── mpv ──
typedef mpv_handle* (*pfn_mpv_create)(void);
typedef int         (*pfn_mpv_initialize)(mpv_handle*);
typedef int         (*pfn_mpv_set_option_string)(mpv_handle*, const char*, const char*);
typedef int         (*pfn_mpv_command)(mpv_handle*, const char**);
typedef int         (*pfn_mpv_command_async)(mpv_handle*, uint64_t, const char**);
typedef char*       (*pfn_mpv_get_property_string)(mpv_handle*, const char*);
typedef int         (*pfn_mpv_get_property)(mpv_handle*, const char*, int, void*);
typedef int         (*pfn_mpv_set_property_string)(mpv_handle*, const char*, const char*);
typedef int         (*pfn_mpv_set_property)(mpv_handle*, const char*, int, void*);
typedef void        (*pfn_mpv_free)(void*);
typedef const char* (*pfn_mpv_error_string)(int);
typedef int         (*pfn_mpv_render_context_create)(mpv_render_context**, mpv_handle*, mpv_render_param*);
typedef int         (*pfn_mpv_render_context_render)(mpv_render_context*, mpv_render_param*);
typedef uint64_t    (*pfn_mpv_render_context_update)(mpv_render_context*);
typedef void        (*pfn_mpv_render_context_set_update_callback)(mpv_render_context*, void(*)(void*), void*);
typedef void        (*pfn_mpv_render_context_free)(mpv_render_context*);
typedef void        (*pfn_mpv_terminate_destroy)(mpv_handle*);

// ═══════════════════════════════════════════════════════════════════
// § 4. GLOBAL STATE
// ═══════════════════════════════════════════════════════════════════

// DLL handles
static HMODULE h_egl  = nullptr;
static HMODULE h_gles = nullptr;
static HMODULE h_mpv  = nullptr;

// EGL function pointers
static pfn_eglGetPlatformDisplayEXT       p_eglGetPlatformDisplayEXT = nullptr;
static pfn_eglInitialize                  p_eglInitialize = nullptr;
static pfn_eglChooseConfig                p_eglChooseConfig = nullptr;
static pfn_eglCreateContext               p_eglCreateContext = nullptr;
static pfn_eglCreatePbufferFromClientBuffer p_eglCreatePbufferFromClientBuffer = nullptr;
static pfn_eglMakeCurrent                 p_eglMakeCurrent = nullptr;
static pfn_eglGetProcAddress              p_eglGetProcAddress = nullptr;
static pfn_eglQueryDisplayAttribEXT       p_eglQueryDisplayAttribEXT = nullptr;
static pfn_eglQueryDeviceAttribEXT        p_eglQueryDeviceAttribEXT = nullptr;
static pfn_eglDestroyContext              p_eglDestroyContext = nullptr;
static pfn_eglDestroySurface              p_eglDestroySurface = nullptr;
static pfn_eglTerminate                   p_eglTerminate = nullptr;
static pfn_eglGetError                    p_eglGetError = nullptr;

// GLES function pointers
static pfn_glFinish   p_glFinish = nullptr;
static pfn_glGetError p_glGetError = nullptr;

// mpv function pointers
static pfn_mpv_create                          p_mpv_create = nullptr;
static pfn_mpv_initialize                      p_mpv_initialize = nullptr;
static pfn_mpv_set_option_string               p_mpv_set_option_string = nullptr;
static pfn_mpv_command                         p_mpv_command = nullptr;
static pfn_mpv_command_async                   p_mpv_command_async = nullptr;
static pfn_mpv_get_property_string             p_mpv_get_property_string = nullptr;
static pfn_mpv_get_property                    p_mpv_get_property = nullptr;
static pfn_mpv_set_property_string             p_mpv_set_property_string = nullptr;
static pfn_mpv_set_property                    p_mpv_set_property = nullptr;
static pfn_mpv_free                            p_mpv_free = nullptr;
static pfn_mpv_error_string                    p_mpv_error_string = nullptr;
static pfn_mpv_render_context_create           p_mpv_render_context_create = nullptr;
static pfn_mpv_render_context_render           p_mpv_render_context_render = nullptr;
static pfn_mpv_render_context_update           p_mpv_render_context_update = nullptr;
static pfn_mpv_render_context_set_update_callback p_mpv_render_context_set_update_callback = nullptr;
static pfn_mpv_render_context_free             p_mpv_render_context_free = nullptr;
static pfn_mpv_terminate_destroy               p_mpv_terminate_destroy = nullptr;

// D3D11 + ANGLE state
static ComPtr<ID3D11Device>         g_device;
static ComPtr<ID3D11DeviceContext>   g_context;
static ComPtr<ID3D11Texture2D>      g_internalTex;   // ANGLE renders here
static ComPtr<ID3D11Texture2D>      g_externalTex;   // Electron reads this
static HANDLE                        g_sharedHandle = nullptr;  // legacy handle for ANGLE
static HANDLE                        g_ntHandle     = nullptr;  // NT handle for Electron
static EGLDisplay                    g_eglDisplay = EGL_NO_DISPLAY;
static EGLContext                    g_eglContext = EGL_NO_CONTEXT;
static EGLSurface                    g_eglSurface = EGL_NO_SURFACE;
static EGLConfig                     g_eglConfig  = nullptr;

// mpv state
static mpv_handle*          g_mpv   = nullptr;
static mpv_render_context*  g_mpvGl = nullptr;
static std::atomic<bool>    g_frameReady{false};

// Dimensions
static uint32_t g_width  = 0;
static uint32_t g_height = 0;

// ═══════════════════════════════════════════════════════════════════
// § 5. HELPERS
// ═══════════════════════════════════════════════════════════════════

static std::string HrStr(HRESULT hr) {
    char buf[32]; snprintf(buf, sizeof(buf), "0x%08lX", (unsigned long)hr);
    return std::string(buf);
}

// mpv's get_proc_address callback — routes through ANGLE's eglGetProcAddress
static void* MpvGetProcAddress(void* /*ctx*/, const char* name) {
    return (void*)p_eglGetProcAddress(name);
}

// mpv update callback — fires from mpv's thread when a new frame is available
static void MpvUpdateCallback(void* /*ctx*/) {
    g_frameReady.store(true, std::memory_order_release);
}

// ═══════════════════════════════════════════════════════════════════
// § 6. DLL LOADING
// ═══════════════════════════════════════════════════════════════════

#define LOAD_FN(mod, name) do { \
    p_##name = (pfn_##name)GetProcAddress(mod, #name); \
    if (!p_##name) return "Failed to load " #name; \
} while(0)

static const char* LoadEgl(const char* path) {
    h_egl = LoadLibraryA(path);
    if (!h_egl) return "Failed to load libEGL.dll";

    LOAD_FN(h_egl, eglInitialize);
    LOAD_FN(h_egl, eglChooseConfig);
    LOAD_FN(h_egl, eglCreateContext);
    LOAD_FN(h_egl, eglCreatePbufferFromClientBuffer);
    LOAD_FN(h_egl, eglMakeCurrent);
    LOAD_FN(h_egl, eglGetProcAddress);
    LOAD_FN(h_egl, eglDestroyContext);
    LOAD_FN(h_egl, eglDestroySurface);
    LOAD_FN(h_egl, eglTerminate);
    LOAD_FN(h_egl, eglGetError);

    // Extension functions loaded via eglGetProcAddress
    p_eglGetPlatformDisplayEXT = (pfn_eglGetPlatformDisplayEXT)
        p_eglGetProcAddress("eglGetPlatformDisplayEXT");
    if (!p_eglGetPlatformDisplayEXT) return "eglGetPlatformDisplayEXT not found";

    p_eglQueryDisplayAttribEXT = (pfn_eglQueryDisplayAttribEXT)
        p_eglGetProcAddress("eglQueryDisplayAttribEXT");
    p_eglQueryDeviceAttribEXT = (pfn_eglQueryDeviceAttribEXT)
        p_eglGetProcAddress("eglQueryDeviceAttribEXT");

    return nullptr;
}

static const char* LoadGles(const char* path) {
    h_gles = LoadLibraryA(path);
    if (!h_gles) return "Failed to load libGLESv2.dll";

    LOAD_FN(h_gles, glFinish);
    LOAD_FN(h_gles, glGetError);
    return nullptr;
}

static const char* LoadMpv(const char* path) {
    h_mpv = LoadLibraryA(path);
    if (!h_mpv) return "Failed to load libmpv-2.dll";

    LOAD_FN(h_mpv, mpv_create);
    LOAD_FN(h_mpv, mpv_initialize);
    LOAD_FN(h_mpv, mpv_set_option_string);
    LOAD_FN(h_mpv, mpv_command);
    LOAD_FN(h_mpv, mpv_command_async);
    LOAD_FN(h_mpv, mpv_get_property_string);
    LOAD_FN(h_mpv, mpv_get_property);
    LOAD_FN(h_mpv, mpv_set_property_string);
    LOAD_FN(h_mpv, mpv_set_property);
    LOAD_FN(h_mpv, mpv_free);
    LOAD_FN(h_mpv, mpv_error_string);
    LOAD_FN(h_mpv, mpv_render_context_create);
    LOAD_FN(h_mpv, mpv_render_context_render);
    LOAD_FN(h_mpv, mpv_render_context_update);
    LOAD_FN(h_mpv, mpv_render_context_set_update_callback);
    LOAD_FN(h_mpv, mpv_render_context_free);
    LOAD_FN(h_mpv, mpv_terminate_destroy);
    return nullptr;
}
#undef LOAD_FN

// ═══════════════════════════════════════════════════════════════════
// § 7. ANGLE + D3D11 INITIALIZATION
// ═══════════════════════════════════════════════════════════════════

static const char* InitAngle(uint32_t width, uint32_t height) {
    // ── Create ANGLE EGL display (D3D11 backend) ───────────────────
    const EGLint displayAttribs[] = {
        EGL_PLATFORM_ANGLE_TYPE_ANGLE,
        EGL_PLATFORM_ANGLE_TYPE_D3D11_ANGLE,
        EGL_PLATFORM_ANGLE_ENABLE_AUTOMATIC_TRIM_ANGLE, EGL_TRUE,
        EGL_NONE,
    };

    g_eglDisplay = p_eglGetPlatformDisplayEXT(
        EGL_PLATFORM_ANGLE_ANGLE, nullptr, displayAttribs);
    if (g_eglDisplay == EGL_NO_DISPLAY)
        return "eglGetPlatformDisplayEXT failed";

    if (!p_eglInitialize(g_eglDisplay, nullptr, nullptr))
        return "eglInitialize failed";

    // ── Choose config ──────────────────────────────────────────────
    const EGLint configAttribs[] = {
        EGL_RED_SIZE, 8,
        EGL_GREEN_SIZE, 8,
        EGL_BLUE_SIZE, 8,
        EGL_ALPHA_SIZE, 8,
        EGL_DEPTH_SIZE, 0,
        EGL_STENCIL_SIZE, 0,
        EGL_SURFACE_TYPE, EGL_PBUFFER_BIT,
        EGL_RENDERABLE_TYPE, EGL_OPENGL_ES2_BIT,
        EGL_NONE,
    };
    EGLint numConfigs = 0;
    if (!p_eglChooseConfig(g_eglDisplay, configAttribs, &g_eglConfig, 1, &numConfigs)
        || numConfigs == 0)
        return "eglChooseConfig failed";

    // ── Create context ─────────────────────────────────────────────
    const EGLint contextAttribs[] = {
        EGL_CONTEXT_CLIENT_VERSION, 2,
        EGL_NONE,
    };
    g_eglContext = p_eglCreateContext(
        g_eglDisplay, g_eglConfig, EGL_NO_CONTEXT, contextAttribs);
    if (g_eglContext == EGL_NO_CONTEXT)
        return "eglCreateContext failed";

    // ── Query ANGLE's internal D3D11 device ────────────────────────
    if (p_eglQueryDisplayAttribEXT && p_eglQueryDeviceAttribEXT) {
        EGLAttrib eglDevice = 0;
        p_eglQueryDisplayAttribEXT(g_eglDisplay, EGL_DEVICE_EXT, &eglDevice);
        if (eglDevice) {
            EGLAttrib d3dDev = 0;
            p_eglQueryDeviceAttribEXT(
                (EGLDeviceEXT)eglDevice, EGL_D3D11_DEVICE_ANGLE, &d3dDev);
            if (d3dDev) {
                g_device = reinterpret_cast<ID3D11Device*>(d3dDev);
                g_device->GetImmediateContext(&g_context);
            }
        }
    }
    if (!g_device)
        return "Failed to query D3D11 device from ANGLE";

    // ── Create INTERNAL texture (ANGLE renders here) ───────────────
    // Uses legacy MISC_SHARED for ANGLE's EGL surface interop
    D3D11_TEXTURE2D_DESC intDesc = {};
    intDesc.Width            = width;
    intDesc.Height           = height;
    intDesc.MipLevels        = 1;
    intDesc.ArraySize        = 1;
    intDesc.Format           = DXGI_FORMAT_B8G8R8A8_UNORM;
    intDesc.SampleDesc.Count = 1;
    intDesc.Usage            = D3D11_USAGE_DEFAULT;
    intDesc.BindFlags        = D3D11_BIND_RENDER_TARGET | D3D11_BIND_SHADER_RESOURCE;
    intDesc.MiscFlags        = D3D11_RESOURCE_MISC_SHARED;

    HRESULT hr = g_device->CreateTexture2D(&intDesc, nullptr, &g_internalTex);
    if (FAILED(hr))
        return "Failed to create internal D3D11 texture";

    // Get legacy shared handle for ANGLE
    ComPtr<IDXGIResource> dxgiRes;
    g_internalTex.As(&dxgiRes);
    hr = dxgiRes->GetSharedHandle(&g_sharedHandle);
    if (FAILED(hr))
        return "GetSharedHandle failed on internal texture";

    // ── Create EXTERNAL texture (Electron reads this) ──────────────
    // Uses NT handle + keyed mutex for Electron's sharedTexture module
    D3D11_TEXTURE2D_DESC extDesc = intDesc;
    extDesc.BindFlags = D3D11_BIND_SHADER_RESOURCE;
    extDesc.MiscFlags = D3D11_RESOURCE_MISC_SHARED_NTHANDLE
                      | D3D11_RESOURCE_MISC_SHARED_KEYEDMUTEX;

    hr = g_device->CreateTexture2D(&extDesc, nullptr, &g_externalTex);
    if (FAILED(hr))
        return "Failed to create external D3D11 texture";

    // Export NT handle
    ComPtr<IDXGIResource1> dxgiRes1;
    g_externalTex.As(&dxgiRes1);
    hr = dxgiRes1->CreateSharedHandle(nullptr,
        DXGI_SHARED_RESOURCE_READ | DXGI_SHARED_RESOURCE_WRITE,
        nullptr, &g_ntHandle);
    if (FAILED(hr))
        return "CreateSharedHandle (NT) failed on external texture";

    // ── Create EGL surface from internal texture's shared handle ───
    const EGLint surfaceAttribs[] = {
        EGL_WIDTH,  (EGLint)width,
        EGL_HEIGHT, (EGLint)height,
        EGL_TEXTURE_FORMAT, EGL_TEXTURE_RGBA,
        EGL_TEXTURE_TARGET, EGL_TEXTURE_2D,
        EGL_NONE,
    };
    g_eglSurface = p_eglCreatePbufferFromClientBuffer(
        g_eglDisplay,
        EGL_D3D_TEXTURE_2D_SHARE_HANDLE_ANGLE,
        (EGLClientBuffer)g_sharedHandle,
        g_eglConfig,
        surfaceAttribs);
    if (g_eglSurface == EGL_NO_SURFACE)
        return "eglCreatePbufferFromClientBuffer failed";

    g_width  = width;
    g_height = height;
    return nullptr;
}

// ═══════════════════════════════════════════════════════════════════
// § 8. MPV INITIALIZATION
// ═══════════════════════════════════════════════════════════════════

static const char* InitMpv() {
    g_mpv = p_mpv_create();
    if (!g_mpv) return "mpv_create failed";

    // Core options
    p_mpv_set_option_string(g_mpv, "vo", "libmpv");
    p_mpv_set_option_string(g_mpv, "hwdec", "auto");
    p_mpv_set_option_string(g_mpv, "gpu-context", "");
    p_mpv_set_option_string(g_mpv, "terminal", "no");
    p_mpv_set_option_string(g_mpv, "osd-level", "0");
    p_mpv_set_option_string(g_mpv, "keep-open", "yes");

    int err = p_mpv_initialize(g_mpv);
    if (err < 0)
        return "mpv_initialize failed";

    // Create OpenGL render context via ANGLE
    // Make EGL current for mpv_render_context_create
    if (!p_eglMakeCurrent(g_eglDisplay, g_eglSurface, g_eglSurface, g_eglContext))
        return "eglMakeCurrent failed before mpv render context creation";

    mpv_opengl_init_params glParams = {};
    glParams.get_proc_address = MpvGetProcAddress;

    int advCtrl = 1;
    mpv_render_param params[] = {
        { MPV_RENDER_PARAM_API_TYPE, (void*)MPV_RENDER_API_TYPE_OPENGL },
        { MPV_RENDER_PARAM_OPENGL_INIT_PARAMS, &glParams },
        { MPV_RENDER_PARAM_ADVANCED_CONTROL, &advCtrl },
        { MPV_RENDER_PARAM_INVALID, nullptr },
    };

    err = p_mpv_render_context_create(&g_mpvGl, g_mpv, params);

    // Release EGL context from this thread
    p_eglMakeCurrent(g_eglDisplay, EGL_NO_SURFACE, EGL_NO_SURFACE, EGL_NO_CONTEXT);

    if (err < 0)
        return "mpv_render_context_create failed";

    // Set frame update callback
    p_mpv_render_context_set_update_callback(g_mpvGl, MpvUpdateCallback, nullptr);

    return nullptr;
}

// ═══════════════════════════════════════════════════════════════════
// § 9. N-API: initGpu(config) → bool
// ═══════════════════════════════════════════════════════════════════

Napi::Value InitGpu(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    auto cfg = info[0].As<Napi::Object>();

    std::string mpvPath  = cfg.Get("mpvPath").As<Napi::String>().Utf8Value();
    std::string eglPath  = cfg.Get("eglPath").As<Napi::String>().Utf8Value();
    std::string glesPath = cfg.Get("glesPath").As<Napi::String>().Utf8Value();
    uint32_t w = cfg.Has("width")  ? cfg.Get("width").As<Napi::Number>().Uint32Value()  : 1920;
    uint32_t h = cfg.Has("height") ? cfg.Get("height").As<Napi::Number>().Uint32Value() : 1080;

    // Load DLLs
    const char* err;
    err = LoadEgl(eglPath.c_str());
    if (err) { Napi::Error::New(env, err).ThrowAsJavaScriptException(); return env.Undefined(); }

    err = LoadGles(glesPath.c_str());
    if (err) { Napi::Error::New(env, err).ThrowAsJavaScriptException(); return env.Undefined(); }

    err = LoadMpv(mpvPath.c_str());
    if (err) { Napi::Error::New(env, err).ThrowAsJavaScriptException(); return env.Undefined(); }

    // Init ANGLE + D3D11 textures
    err = InitAngle(w, h);
    if (err) { Napi::Error::New(env, err).ThrowAsJavaScriptException(); return env.Undefined(); }

    // Init mpv
    err = InitMpv();
    if (err) { Napi::Error::New(env, err).ThrowAsJavaScriptException(); return env.Undefined(); }

    return Napi::Boolean::New(env, true);
}

// ═══════════════════════════════════════════════════════════════════
// § 10. N-API: loadFile(path)
// ═══════════════════════════════════════════════════════════════════

Napi::Value LoadFile(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (!g_mpv) {
        Napi::Error::New(env, "mpv not initialized").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    std::string path = info[0].As<Napi::String>().Utf8Value();
    const char* cmd[] = { "loadfile", path.c_str(), nullptr };
    int err = p_mpv_command(g_mpv, cmd);
    if (err < 0) {
        Napi::Error::New(env, std::string("loadfile failed: ") + p_mpv_error_string(err))
            .ThrowAsJavaScriptException();
    }
    return env.Undefined();
}

// ═══════════════════════════════════════════════════════════════════
// § 11. N-API: renderFrame() → Buffer | null
// ═══════════════════════════════════════════════════════════════════
// Renders the current mpv frame to the internal texture via ANGLE,
// copies to external texture, returns the NT handle as a Buffer.

Napi::Value RenderFrame(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (!g_mpvGl) return env.Null();

    // Check if mpv has a new frame (optional — we render regardless)
    uint64_t flags = p_mpv_render_context_update(g_mpvGl);

    // Make ANGLE context current
    if (!p_eglMakeCurrent(g_eglDisplay, g_eglSurface, g_eglSurface, g_eglContext)) {
        return env.Null();
    }

    // Render mpv frame to FBO 0 (the EGL surface, backed by internal D3D11 texture)
    int flipY = 1;
    int blockTarget = 0;
    mpv_opengl_fbo fbo = { 0, (int)g_width, (int)g_height, 0 };
    mpv_render_param renderParams[] = {
        { MPV_RENDER_PARAM_OPENGL_FBO, &fbo },
        { MPV_RENDER_PARAM_FLIP_Y, &flipY },
        { MPV_RENDER_PARAM_BLOCK_FOR_TARGET_TIME, &blockTarget },
        { MPV_RENDER_PARAM_INVALID, nullptr },
    };
    p_mpv_render_context_render(g_mpvGl, renderParams);

    // Ensure GPU work is complete
    p_glFinish();

    // Release EGL context
    p_eglMakeCurrent(g_eglDisplay, EGL_NO_SURFACE, EGL_NO_SURFACE, EGL_NO_CONTEXT);

    // Copy internal → external texture
    ComPtr<IDXGIKeyedMutex> mutex;
    g_externalTex.As(&mutex);
    if (mutex) {
        HRESULT hr = mutex->AcquireSync(0, 5000);
        if (FAILED(hr)) return env.Null();
    }

    g_context->CopyResource(g_externalTex.Get(), g_internalTex.Get());
    g_context->Flush();

    if (mutex) {
        mutex->ReleaseSync(0);
    }

    g_frameReady.store(false, std::memory_order_release);

    // Return NT handle as Buffer
    auto buf = Napi::Buffer<uint8_t>::New(env, sizeof(uintptr_t));
    uintptr_t val = reinterpret_cast<uintptr_t>(g_ntHandle);
    memcpy(buf.Data(), &val, sizeof(uintptr_t));
    return buf;
}

// ═══════════════════════════════════════════════════════════════════
// § 12. N-API: command(args[]) / getProperty / setProperty / getState
// ═══════════════════════════════════════════════════════════════════

Napi::Value MpvCommand(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (!g_mpv) return env.Undefined();

    auto arr = info[0].As<Napi::Array>();
    std::vector<std::string> strs(arr.Length());
    std::vector<const char*> ptrs(arr.Length() + 1);
    for (uint32_t i = 0; i < arr.Length(); i++) {
        strs[i] = arr.Get(i).As<Napi::String>().Utf8Value();
        ptrs[i] = strs[i].c_str();
    }
    ptrs[arr.Length()] = nullptr;
    p_mpv_command(g_mpv, ptrs.data());
    return env.Undefined();
}

Napi::Value GetProperty(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (!g_mpv) return env.Null();

    std::string name = info[0].As<Napi::String>().Utf8Value();
    char* val = p_mpv_get_property_string(g_mpv, name.c_str());
    if (!val) return env.Null();
    auto result = Napi::String::New(env, val);
    p_mpv_free(val);
    return result;
}

Napi::Value SetProperty(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (!g_mpv) return env.Undefined();

    std::string name = info[0].As<Napi::String>().Utf8Value();
    std::string val  = info[1].As<Napi::String>().Utf8Value();
    p_mpv_set_property_string(g_mpv, name.c_str(), val.c_str());
    return env.Undefined();
}

Napi::Value GetState(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (!g_mpv) return env.Null();

    auto obj = Napi::Object::New(env);

    double timePos = 0;
    if (p_mpv_get_property(g_mpv, "time-pos", MPV_FORMAT_DOUBLE, &timePos) >= 0)
        obj.Set("timePos", timePos);
    else
        obj.Set("timePos", 0.0);

    double duration = 0;
    if (p_mpv_get_property(g_mpv, "duration", MPV_FORMAT_DOUBLE, &duration) >= 0)
        obj.Set("duration", duration);
    else
        obj.Set("duration", 0.0);

    int paused = 0;
    p_mpv_get_property(g_mpv, "pause", MPV_FORMAT_FLAG, &paused);
    obj.Set("paused", (bool)paused);

    int eof = 0;
    p_mpv_get_property(g_mpv, "eof-reached", MPV_FORMAT_FLAG, &eof);
    obj.Set("eofReached", (bool)eof);

    obj.Set("width", g_width);
    obj.Set("height", g_height);

    return obj;
}

// ═══════════════════════════════════════════════════════════════════
// § 13. N-API: getHandle() / getSize() (compatibility with Phase 2a)
// ═══════════════════════════════════════════════════════════════════

Napi::Value GetHandle(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (!g_ntHandle) return env.Null();
    auto buf = Napi::Buffer<uint8_t>::New(env, sizeof(uintptr_t));
    uintptr_t val = reinterpret_cast<uintptr_t>(g_ntHandle);
    memcpy(buf.Data(), &val, sizeof(uintptr_t));
    return buf;
}

Napi::Value GetSize(const Napi::CallbackInfo& info) {
    auto obj = Napi::Object::New(info.Env());
    obj.Set("width", g_width);
    obj.Set("height", g_height);
    return obj;
}

// ═══════════════════════════════════════════════════════════════════
// § 14. N-API: destroy()
// ═══════════════════════════════════════════════════════════════════

Napi::Value Destroy(const Napi::CallbackInfo& info) {
    // Tear down in reverse order
    if (g_mpvGl) {
        p_mpv_render_context_free(g_mpvGl);
        g_mpvGl = nullptr;
    }
    if (g_mpv) {
        p_mpv_terminate_destroy(g_mpv);
        g_mpv = nullptr;
    }
    if (g_eglSurface != EGL_NO_SURFACE && g_eglDisplay != EGL_NO_DISPLAY) {
        p_eglDestroySurface(g_eglDisplay, g_eglSurface);
        g_eglSurface = EGL_NO_SURFACE;
    }
    if (g_eglContext != EGL_NO_CONTEXT && g_eglDisplay != EGL_NO_DISPLAY) {
        p_eglDestroyContext(g_eglDisplay, g_eglContext);
        g_eglContext = EGL_NO_CONTEXT;
    }
    if (g_eglDisplay != EGL_NO_DISPLAY) {
        p_eglTerminate(g_eglDisplay);
        g_eglDisplay = EGL_NO_DISPLAY;
    }
    if (g_ntHandle) { CloseHandle(g_ntHandle); g_ntHandle = nullptr; }

    g_externalTex.Reset();
    g_internalTex.Reset();
    g_context.Reset();
    g_device.Reset();

    if (h_mpv)  { FreeLibrary(h_mpv);  h_mpv  = nullptr; }
    if (h_gles) { FreeLibrary(h_gles); h_gles = nullptr; }
    if (h_egl)  { FreeLibrary(h_egl);  h_egl  = nullptr; }

    g_width = g_height = 0;
    return info.Env().Undefined();
}

// ═══════════════════════════════════════════════════════════════════
// § 15. MODULE INIT
// ═══════════════════════════════════════════════════════════════════

Napi::Object InitModule(Napi::Env env, Napi::Object exports) {
    exports.Set("initGpu",      Napi::Function::New(env, InitGpu));
    exports.Set("loadFile",     Napi::Function::New(env, LoadFile));
    exports.Set("renderFrame",  Napi::Function::New(env, RenderFrame));
    exports.Set("command",      Napi::Function::New(env, MpvCommand));
    exports.Set("getProperty",  Napi::Function::New(env, GetProperty));
    exports.Set("setProperty",  Napi::Function::New(env, SetProperty));
    exports.Set("getState",     Napi::Function::New(env, GetState));
    exports.Set("getHandle",    Napi::Function::New(env, GetHandle));
    exports.Set("getSize",      Napi::Function::New(env, GetSize));
    exports.Set("destroy",      Napi::Function::New(env, Destroy));
    return exports;
}

NODE_API_MODULE(holy_grail, InitModule)
