//! `window.aifigma`: the control channel for the page, as promises.
//!
//! The same JSON methods as the desktop control server (`crates/ui-egui/src/control.rs`), so the
//! assistant panel next to the editor (studio/) drives AI-Figma with the commands the CLI and the
//! MCP server use:
//!
//! ```js
//! await aifigma.execute("shape.rectangle", {x: 0, y: 0, width: 100, height: 50}) // a command → its result
//! await aifigma.request("ui.inspect")                  // a control method → its result
//! await aifigma.commands()                             // every command with its params doc
//! const {data} = await aifigma.screenshot()            // the window as PNG (base64)
//! aifigma.currentTheme(); await aifigma.setTheme("brand") // brand | light | dark | system
//! aifigma.wantsKeyboard()                              // a text field has the keyboard
//! ```
//!
//! Results resolve with the method's `result`; errors reject with an `Error`. Save and Save as
//! reach the page as an `aifigma:save` event on `window` (`detail.saveAs`), Help as `aifigma:help`.

use std::cell::RefCell;
use std::sync::mpsc::{Receiver, TryRecvError};

use figcraft_ui_egui::{ControlReply, ControlRequest, FigApp};
use serde_json::{Value, json};
use wasm_bindgen::prelude::*;

/// The most requests the page may have waiting at once (a runaway script can't fill the memory).
const MAX_WAITING: usize = 256;

type Waiting = (Receiver<ControlReply>, js_sys::Function, js_sys::Function);

thread_local! {
    static QUEUE: RefCell<Vec<ControlRequest>> = const { RefCell::new(Vec::new()) };
    static WAITING: RefCell<Vec<Waiting>> = const { RefCell::new(Vec::new()) };
    static CTX: RefCell<Option<egui::Context>> = const { RefCell::new(None) };
}

/// The page's requests reach the app through its egui context (to wake it for a frame).
pub fn connect(ctx: egui::Context) {
    CTX.with(|c| *c.borrow_mut() = Some(ctx));
}

fn repaint() {
    CTX.with(|c| {
        if let Some(ctx) = c.borrow().as_ref() {
            ctx.request_repaint();
        }
    });
}

/// Hand the page's requests to the app (called at the start of each frame).
pub fn deliver(app: &mut FigApp) {
    QUEUE.with(|q| app.control_queue.append(&mut q.borrow_mut()));
}

fn to_js(v: &Value) -> JsValue {
    js_sys::JSON::parse(&v.to_string()).unwrap_or(JsValue::NULL)
}

fn from_js(v: &JsValue) -> Value {
    if v.is_undefined() || v.is_null() {
        return json!({});
    }
    js_sys::JSON::stringify(v).ok().and_then(|s| s.as_string()).and_then(|s| serde_json::from_str(&s).ok()).unwrap_or(json!({}))
}

/// Settle the promises of answered requests (called after each frame).
pub fn poll_replies() {
    WAITING.with(|w| {
        w.borrow_mut().retain(|(rx, resolve, reject)| match rx.try_recv() {
            Ok(reply) => {
                match reply.result {
                    Ok(v) => {
                        let _ = resolve.call1(&JsValue::NULL, &to_js(&v));
                    }
                    Err(e) => {
                        let _ = reject.call1(&JsValue::NULL, &js_sys::Error::new(&e));
                    }
                }
                false
            }
            Err(TryRecvError::Empty) => true,
            Err(TryRecvError::Disconnected) => {
                let _ = reject.call1(&JsValue::NULL, &js_sys::Error::new("request dropped"));
                false
            }
        });
    });
}

fn request(method: &str, params: Value) -> js_sys::Promise {
    let method = method.to_string();
    let p = js_sys::Promise::new(&mut |resolve, reject| {
        if CTX.with(|c| c.borrow().is_none()) {
            let _ = reject.call1(&JsValue::NULL, &js_sys::Error::new("AI-Figma is not running yet"));
            return;
        }
        if WAITING.with(|w| w.borrow().len()) >= MAX_WAITING {
            let _ = reject.call1(&JsValue::NULL, &js_sys::Error::new("too many requests waiting"));
            return;
        }
        let (tx, rx) = std::sync::mpsc::channel();
        let req = ControlRequest { id: json!(0), method: method.clone(), params: params.clone(), reply: tx, cancelled: Default::default() };
        QUEUE.with(|q| q.borrow_mut().push(req));
        WAITING.with(|w| w.borrow_mut().push((rx, resolve, reject)));
    });
    repaint();
    p
}

fn set(obj: &js_sys::Object, name: &str, f: JsValue) -> Result<(), JsValue> {
    js_sys::Reflect::set(obj, &name.into(), &f).map(|_| ())
}

/// Tell the page something happened (`aifigma:<what>` on `window`, with `detail`).
pub fn notify(what: &str, detail: Value) {
    let Some(window) = web_sys::window() else { return };
    let init = web_sys::CustomEventInit::new();
    init.set_detail(&to_js(&detail));
    if let Ok(event) = web_sys::CustomEvent::new_with_event_init_dict(&format!("aifigma:{what}"), &init) {
        let _ = window.dispatch_event(&event);
    }
}

/// Install `window.aifigma`.
pub fn install() -> Result<(), JsValue> {
    let obj = js_sys::Object::new();
    set(
        &obj,
        "request",
        Closure::<dyn Fn(String, JsValue) -> js_sys::Promise>::new(|method: String, params: JsValue| request(&method, from_js(&params)))
            .into_js_value(),
    )?;
    set(
        &obj,
        "execute",
        Closure::<dyn Fn(String, JsValue) -> js_sys::Promise>::new(|command: String, params: JsValue| {
            request("engine.execute", json!({"command": command, "params": from_js(&params)}))
        })
        .into_js_value(),
    )?;
    set(&obj, "commands", Closure::<dyn Fn() -> js_sys::Promise>::new(|| request("engine.commands", json!({}))).into_js_value())?;
    set(&obj, "inspect", Closure::<dyn Fn() -> js_sys::Promise>::new(|| request("ui.inspect", json!({}))).into_js_value())?;
    // A page has no file to write the capture to: the PNG comes back as base64 `data`.
    set(&obj, "screenshot", Closure::<dyn Fn() -> js_sys::Promise>::new(|| request("ui.screenshot", json!({}))).into_js_value())?;
    set(
        &obj,
        "currentTheme",
        Closure::<dyn Fn() -> JsValue>::new(|| {
            let id = CTX.with(|c| {
                c.borrow().as_ref().map(|ctx| {
                    let t = figcraft_ui_egui::theme::Tokens::get(ctx);
                    if t.brand {
                        "brand"
                    } else if t.dark {
                        "dark"
                    } else {
                        "light"
                    }
                })
            });
            id.map_or(JsValue::NULL, JsValue::from_str)
        })
        .into_js_value(),
    )?;
    set(
        &obj,
        "setTheme",
        Closure::<dyn Fn(String) -> js_sys::Promise>::new(|theme: String| {
            let command = match theme.as_str() {
                "light" => "view.themeLight",
                "dark" => "view.themeDark",
                "system" => "view.themeSystem",
                _ => "view.themeBrand",
            };
            request("engine.execute", json!({"command": command, "params": {}}))
        })
        .into_js_value(),
    )?;
    set(
        &obj,
        "wantsKeyboard",
        Closure::<dyn Fn() -> bool>::new(|| CTX.with(|c| c.borrow().as_ref().is_some_and(|ctx| ctx.text_edit_focused()))).into_js_value(),
    )?;
    set(&obj, "product", JsValue::from_str("AI-Figma"))?;
    let w = web_sys::window().ok_or("no window")?;
    js_sys::Reflect::set(&w, &"aifigma".into(), &obj)?;
    Ok(())
}
