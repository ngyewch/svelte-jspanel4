function noop() { }
function assign(tar, src) {
    // @ts-ignore
    for (const k in src)
        tar[k] = src[k];
    return tar;
}
function run(fn) {
    return fn();
}
function blank_object() {
    return Object.create(null);
}
function run_all(fns) {
    fns.forEach(run);
}
function is_function(thing) {
    return typeof thing === 'function';
}
function safe_not_equal(a, b) {
    return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
}
function is_empty(obj) {
    return Object.keys(obj).length === 0;
}
function create_slot(definition, ctx, $$scope, fn) {
    if (definition) {
        const slot_ctx = get_slot_context(definition, ctx, $$scope, fn);
        return definition[0](slot_ctx);
    }
}
function get_slot_context(definition, ctx, $$scope, fn) {
    return definition[1] && fn
        ? assign($$scope.ctx.slice(), definition[1](fn(ctx)))
        : $$scope.ctx;
}
function get_slot_changes(definition, $$scope, dirty, fn) {
    if (definition[2] && fn) {
        const lets = definition[2](fn(dirty));
        if ($$scope.dirty === undefined) {
            return lets;
        }
        if (typeof lets === 'object') {
            const merged = [];
            const len = Math.max($$scope.dirty.length, lets.length);
            for (let i = 0; i < len; i += 1) {
                merged[i] = $$scope.dirty[i] | lets[i];
            }
            return merged;
        }
        return $$scope.dirty | lets;
    }
    return $$scope.dirty;
}
function update_slot_base(slot, slot_definition, ctx, $$scope, slot_changes, get_slot_context_fn) {
    if (slot_changes) {
        const slot_context = get_slot_context(slot_definition, ctx, $$scope, get_slot_context_fn);
        slot.p(slot_context, slot_changes);
    }
}
function get_all_dirty_from_scope($$scope) {
    if ($$scope.ctx.length > 32) {
        const dirty = [];
        const length = $$scope.ctx.length / 32;
        for (let i = 0; i < length; i++) {
            dirty[i] = -1;
        }
        return dirty;
    }
    return -1;
}
function compute_slots(slots) {
    const result = {};
    for (const key in slots) {
        result[key] = true;
    }
    return result;
}
function append(target, node) {
    target.appendChild(node);
}
function insert(target, node, anchor) {
    target.insertBefore(node, anchor || null);
}
function detach(node) {
    node.parentNode.removeChild(node);
}
function element(name) {
    return document.createElement(name);
}
function text(data) {
    return document.createTextNode(data);
}
function space() {
    return text(' ');
}
function children(element) {
    return Array.from(element.childNodes);
}
function set_style(node, key, value, important) {
    if (value === null) {
        node.style.removeProperty(key);
    }
    else {
        node.style.setProperty(key, value, important ? 'important' : '');
    }
}

let current_component;
function set_current_component(component) {
    current_component = component;
}

const dirty_components = [];
const binding_callbacks = [];
const render_callbacks = [];
const flush_callbacks = [];
const resolved_promise = Promise.resolve();
let update_scheduled = false;
function schedule_update() {
    if (!update_scheduled) {
        update_scheduled = true;
        resolved_promise.then(flush);
    }
}
function add_render_callback(fn) {
    render_callbacks.push(fn);
}
// flush() calls callbacks in this order:
// 1. All beforeUpdate callbacks, in order: parents before children
// 2. All bind:this callbacks, in reverse order: children before parents.
// 3. All afterUpdate callbacks, in order: parents before children. EXCEPT
//    for afterUpdates called during the initial onMount, which are called in
//    reverse order: children before parents.
// Since callbacks might update component values, which could trigger another
// call to flush(), the following steps guard against this:
// 1. During beforeUpdate, any updated components will be added to the
//    dirty_components array and will cause a reentrant call to flush(). Because
//    the flush index is kept outside the function, the reentrant call will pick
//    up where the earlier call left off and go through all dirty components. The
//    current_component value is saved and restored so that the reentrant call will
//    not interfere with the "parent" flush() call.
// 2. bind:this callbacks cannot trigger new flush() calls.
// 3. During afterUpdate, any updated components will NOT have their afterUpdate
//    callback called a second time; the seen_callbacks set, outside the flush()
//    function, guarantees this behavior.
const seen_callbacks = new Set();
let flushidx = 0; // Do *not* move this inside the flush() function
function flush() {
    const saved_component = current_component;
    do {
        // first, call beforeUpdate functions
        // and update components
        while (flushidx < dirty_components.length) {
            const component = dirty_components[flushidx];
            flushidx++;
            set_current_component(component);
            update(component.$$);
        }
        set_current_component(null);
        dirty_components.length = 0;
        flushidx = 0;
        while (binding_callbacks.length)
            binding_callbacks.pop()();
        // then, once components are updated, call
        // afterUpdate functions. This may cause
        // subsequent updates...
        for (let i = 0; i < render_callbacks.length; i += 1) {
            const callback = render_callbacks[i];
            if (!seen_callbacks.has(callback)) {
                // ...so guard against infinite loops
                seen_callbacks.add(callback);
                callback();
            }
        }
        render_callbacks.length = 0;
    } while (dirty_components.length);
    while (flush_callbacks.length) {
        flush_callbacks.pop()();
    }
    update_scheduled = false;
    seen_callbacks.clear();
    set_current_component(saved_component);
}
function update($$) {
    if ($$.fragment !== null) {
        $$.update();
        run_all($$.before_update);
        const dirty = $$.dirty;
        $$.dirty = [-1];
        $$.fragment && $$.fragment.p($$.ctx, dirty);
        $$.after_update.forEach(add_render_callback);
    }
}
const outroing = new Set();
let outros;
function transition_in(block, local) {
    if (block && block.i) {
        outroing.delete(block);
        block.i(local);
    }
}
function transition_out(block, local, detach, callback) {
    if (block && block.o) {
        if (outroing.has(block))
            return;
        outroing.add(block);
        outros.c.push(() => {
            outroing.delete(block);
            if (callback) {
                if (detach)
                    block.d(1);
                callback();
            }
        });
        block.o(local);
    }
    else if (callback) {
        callback();
    }
}
function mount_component(component, target, anchor, customElement) {
    const { fragment, after_update } = component.$$;
    fragment && fragment.m(target, anchor);
    if (!customElement) {
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = component.$$.on_mount.map(run).filter(is_function);
            // if the component was destroyed immediately
            // it will update the `$$.on_destroy` reference to `null`.
            // the destructured on_destroy may still reference to the old array
            if (component.$$.on_destroy) {
                component.$$.on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
    }
    after_update.forEach(add_render_callback);
}
function destroy_component(component, detaching) {
    const $$ = component.$$;
    if ($$.fragment !== null) {
        run_all($$.on_destroy);
        $$.fragment && $$.fragment.d(detaching);
        // TODO null out other refs, including component.$$ (but need to
        // preserve final state?)
        $$.on_destroy = $$.fragment = null;
        $$.ctx = [];
    }
}
function make_dirty(component, i) {
    if (component.$$.dirty[0] === -1) {
        dirty_components.push(component);
        schedule_update();
        component.$$.dirty.fill(0);
    }
    component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
}
function init(component, options, instance, create_fragment, not_equal, props, append_styles, dirty = [-1]) {
    const parent_component = current_component;
    set_current_component(component);
    const $$ = component.$$ = {
        fragment: null,
        ctx: [],
        // state
        props,
        update: noop,
        not_equal,
        bound: blank_object(),
        // lifecycle
        on_mount: [],
        on_destroy: [],
        on_disconnect: [],
        before_update: [],
        after_update: [],
        context: new Map(options.context || (parent_component ? parent_component.$$.context : [])),
        // everything else
        callbacks: blank_object(),
        dirty,
        skip_bound: false,
        root: options.target || parent_component.$$.root
    };
    append_styles && append_styles($$.root);
    let ready = false;
    $$.ctx = instance
        ? instance(component, options.props || {}, (i, ret, ...rest) => {
            const value = rest.length ? rest[0] : ret;
            if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                if (!$$.skip_bound && $$.bound[i])
                    $$.bound[i](value);
                if (ready)
                    make_dirty(component, i);
            }
            return ret;
        })
        : [];
    $$.update();
    ready = true;
    run_all($$.before_update);
    // `false` as a special case of no DOM component
    $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
    if (options.target) {
        if (options.hydrate) {
            const nodes = children(options.target);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            $$.fragment && $$.fragment.l(nodes);
            nodes.forEach(detach);
        }
        else {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            $$.fragment && $$.fragment.c();
        }
        if (options.intro)
            transition_in(component.$$.fragment);
        mount_component(component, options.target, options.anchor, options.customElement);
        flush();
    }
    set_current_component(parent_component);
}
/**
 * Base class for Svelte components. Used when dev=false.
 */
class SvelteComponent {
    $destroy() {
        destroy_component(this, 1);
        this.$destroy = noop;
    }
    $on(type, callback) {
        if (!is_function(callback)) {
            return noop;
        }
        const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
        callbacks.push(callback);
        return () => {
            const index = callbacks.indexOf(callback);
            if (index !== -1)
                callbacks.splice(index, 1);
        };
    }
    $set($$props) {
        if (this.$$set && !is_empty($$props)) {
            this.$$.skip_bound = true;
            this.$$set($$props);
            this.$$.skip_bound = false;
        }
    }
}

let jsPanel={version:"4.16.0",date:"2022-07-03 19:05",ajaxAlwaysCallbacks:[],autopositionSpacing:4,closeOnEscape:void document.addEventListener("keydown",e=>{"Escape"!==e.key&&"Escape"!==e.code&&"Esc"!==e.key||jsPanel.getPanels(e=>e.classList.contains("jsPanel")).some(e=>!!e.options.closeOnEscape&&("function"==typeof e.options.closeOnEscape?e.options.closeOnEscape.call(e,e):(e.close(null,!0),!0)));},!1),defaults:{boxShadow:3,container:"window",contentSize:{width:"400px",height:"200px"},dragit:{cursor:"move",handles:".jsPanel-headerlogo, .jsPanel-titlebar, .jsPanel-ftr",opacity:.8,disableOnMaximized:!0},header:!0,headerTitle:"jsPanel",headerControls:{size:"md"},iconfont:void 0,maximizedMargin:0,minimizeTo:"default",paneltype:"standard",position:{my:"center",at:"center"},resizeit:{handles:"n, e, s, w, ne, se, sw, nw",minWidth:128,minHeight:38},theme:"default"},defaultAutocloseConfig:{time:"8s",progressbar:!0},defaultSnapConfig:{sensitivity:70,trigger:"panel",active:"both"},extensions:{},globalCallbacks:!1,icons:{close:'<svg focusable="false" class="jsPanel-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 22"><path fill="currentColor" d="M13.7,11l6.1-6.1c0.4-0.4,0.4-0.9,0-1.3l-1.4-1.4c-0.4-0.4-0.9-0.4-1.3,0L11,8.3L4.9,2.3C4.6,1.9,4,1.9,3.7,2.3L2.3,3.7 C1.9,4,1.9,4.6,2.3,4.9L8.3,11l-6.1,6.1c-0.4,0.4-0.4,0.9,0,1.3l1.4,1.4c0.4,0.4,0.9,0.4,1.3,0l6.1-6.1l6.1,6.1 c0.4,0.4,0.9,0.4,1.3,0l1.4-1.4c0.4-0.4,0.4-0.9,0-1.3L13.7,11z"/></svg>',maximize:'<svg focusable="false" class="jsPanel-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 22"><path fill="currentColor" d="M18.3,2H3.7C2.8,2,2,2.9,2,3.9v14.1C2,19.1,2.8,20,3.7,20h14.6c0.9,0,1.7-0.9,1.7-1.9V3.9C20,2.9,19.2,2,18.3,2z M18.3,17.8 c0,0.1-0.1,0.2-0.2,0.2H3.9c-0.1,0-0.2-0.1-0.2-0.2V8.4h14.6V17.8z"/></svg>',normalize:'<svg focusable="false" class="jsPanel-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 22"><path fill="currentColor" d="M18.3,2H7.1C6.1,2,5.4,2.8,5.4,3.7v1.7H3.7C2.8,5.4,2,6.1,2,7.1v11.3C2,19.2,2.8,20,3.7,20h11.3c0.9,0,1.7-0.8,1.7-1.7v-1.7 h1.7c0.9,0,1.7-0.8,1.7-1.7V3.7C20,2.8,19.2,2,18.3,2z M14.9,18.3H3.7V11h11.3V18.3z M18.3,14.9h-1.7V7.1c0-0.9-0.8-1.7-1.7-1.7H7.1 V3.7h11.3V14.9z"/></svg>',minimize:'<svg focusable="false" class="jsPanel-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 22"><path fill="currentColor" d="M18.9,19.8H3.1c-0.6,0-1.1-0.5-1.1-1.1s0.5-1.1,1.1-1.1h15.8c0.6,0,1.1,0.5,1.1,1.1S19.5,19.8,18.9,19.8z"/></svg>',smallify:'<svg focusable="false" class="jsPanel-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 22"><path fill="currentColor" d="M2.1,15.2L2.9,16c0.2,0.2,0.5,0.2,0.7,0L11,8.7l7.4,7.3c0.2,0.2,0.5,0.2,0.7,0l0.8-0.8c0.2-0.2,0.2-0.5,0-0.7L11.3,6 c-0.2-0.2-0.5-0.2-0.7,0l-8.5,8.5C2,14.7,2,15,2.1,15.2z"/></svg>'},idCounter:0,isIE:(()=>document.documentMode||!1)(),pointerdown:"onpointerdown"in window?["pointerdown"]:"ontouchend"in window?["touchstart","mousedown"]:["mousedown"],pointermove:"onpointermove"in window?["pointermove"]:"ontouchend"in window?["touchmove","mousemove"]:["mousemove"],pointerup:"onpointerup"in window?["pointerup"]:"ontouchend"in window?["touchend","mouseup"]:["mouseup"],polyfills:(Object.assign||Object.defineProperty(Object,"assign",{enumerable:!1,configurable:!0,writable:!0,value:function(e){if(null==e)throw new TypeError("Cannot convert first argument to object");let t=Object(e);for(let e=1;e<arguments.length;e++){let o=arguments[e];if(null==o)continue;o=Object(o);let n=Object.keys(Object(o));for(let e=0,a=n.length;e<a;e++){let a=n[e],s=Object.getOwnPropertyDescriptor(o,a);void 0!==s&&s.enumerable&&(t[a]=o[a]);}}return t}}),Object.entries||(Object.entries=function(e){for(var t=Object.keys(e),o=t.length,n=new Array(o);o--;)n[o]=[t[o],e[t[o]]];return n}),window.NodeList&&!NodeList.prototype.forEach&&(NodeList.prototype.forEach=function(e,t){t=t||window;for(let o=0;o<this.length;o++)e.call(t,this[o],o,this);}),void[Element.prototype,Document.prototype,DocumentFragment.prototype].forEach(function(e){e.append=e.append||function(){let e=Array.prototype.slice.call(arguments),t=document.createDocumentFragment();e.forEach(function(e){let o=e instanceof Node;t.appendChild(o?e:document.createTextNode(String(e)));}),this.appendChild(t);};}),window.Element&&!Element.prototype.closest&&(Element.prototype.closest=function(e){let t,o=(this.document||this.ownerDocument).querySelectorAll(e),n=this;do{for(t=o.length;--t>=0&&o.item(t)!==n;);}while(t<0&&(n=n.parentElement));return n}),function(){if("function"==typeof window.CustomEvent)return !1;function e(e,t){t=t||{bubbles:!1,cancelable:!1,detail:void 0};let o=document.createEvent("CustomEvent");return o.initCustomEvent(e,t.bubbles,t.cancelable,t.detail),o}e.prototype=window.Event.prototype,window.CustomEvent=e;}(),String.prototype.endsWith||(String.prototype.endsWith=function(e,t){return (void 0===t||t>this.length)&&(t=this.length),this.substring(t-e.length,t)===e}),String.prototype.startsWith||Object.defineProperty(String.prototype,"startsWith",{value:function(e,t){var o=t>0?0|t:0;return this.substring(o,o+e.length)===e}}),String.prototype.includes||(String.prototype.includes=function(e,t){if(e instanceof RegExp)throw TypeError("first argument must not be a RegExp");return void 0===t&&(t=0),-1!==this.indexOf(e,t)}),String.prototype.repeat||(String.prototype.repeat=function(e){if(null==this)throw new TypeError("can't convert "+this+" to object");var t=""+this;if((e=+e)!=e&&(e=0),e<0)throw new RangeError("repeat count must be non-negative");if(e==1/0)throw new RangeError("repeat count must be less than infinity");if(e=Math.floor(e),0==t.length||0==e)return "";if(t.length*e>=1<<28)throw new RangeError("repeat count must not overflow maximum string size");var o=t.length*e;for(e=Math.floor(Math.log(e)/Math.log(2));e;)t+=t,e--;return t+=t.substring(0,o-t.length)}),Number.isInteger=Number.isInteger||function(e){return "number"==typeof e&&isFinite(e)&&Math.floor(e)===e},void(Array.prototype.includes||Object.defineProperty(Array.prototype,"includes",{value:function(e,t){if(null==this)throw new TypeError('"this" is null or not defined');let o=Object(this),n=o.length>>>0;if(0===n)return !1;let a=0|t,s=Math.max(a>=0?a:n-Math.abs(a),0);for(;s<n;){if((r=o[s])===(l=e)||"number"==typeof r&&"number"==typeof l&&isNaN(r)&&isNaN(l))return !0;s++;}var r,l;return !1}}))),themes:["default","primary","secondary","info","success","warning","danger","light","dark"],ziBase:100,colorFilledLight:.81,colorFilledDark:.08,colorFilled:0,colorBrightnessThreshold:.55,colorNames:{aliceblue:"f0f8ff",antiquewhite:"faebd7",aqua:"00ffff",aquamarine:"7fffd4",azure:"f0ffff",beige:"f5f5dc",bisque:"ffe4c4",black:"000000",blanchedalmond:"ffebcd",blue:"0000ff",blueviolet:"8a2be2",brown:"a52a2a",burlywood:"deb887",cadetblue:"5f9ea0",chartreuse:"7fff00",chocolate:"d2691e",coral:"ff7f50",cornflowerblue:"6495ed",cornsilk:"fff8dc",crimson:"dc143c",cyan:"00ffff",darkblue:"00008b",darkcyan:"008b8b",darkgoldenrod:"b8860b",darkgray:"a9a9a9",darkgrey:"a9a9a9",darkgreen:"006400",darkkhaki:"bdb76b",darkmagenta:"8b008b",darkolivegreen:"556b2f",darkorange:"ff8c00",darkorchid:"9932cc",darkred:"8b0000",darksalmon:"e9967a",darkseagreen:"8fbc8f",darkslateblue:"483d8b",darkslategray:"2f4f4f",darkslategrey:"2f4f4f",darkturquoise:"00ced1",darkviolet:"9400d3",deeppink:"ff1493",deepskyblue:"00bfff",dimgray:"696969",dimgrey:"696969",dodgerblue:"1e90ff",firebrick:"b22222",floralwhite:"fffaf0",forestgreen:"228b22",fuchsia:"ff00ff",gainsboro:"dcdcdc",ghostwhite:"f8f8ff",gold:"ffd700",goldenrod:"daa520",gray:"808080",grey:"808080",green:"008000",greenyellow:"adff2f",honeydew:"f0fff0",hotpink:"ff69b4",indianred:"cd5c5c",indigo:"4b0082",ivory:"fffff0",khaki:"f0e68c",lavender:"e6e6fa",lavenderblush:"fff0f5",lawngreen:"7cfc00",lemonchiffon:"fffacd",lightblue:"add8e6",lightcoral:"f08080",lightcyan:"e0ffff",lightgoldenrodyellow:"fafad2",lightgray:"d3d3d3",lightgrey:"d3d3d3",lightgreen:"90ee90",lightpink:"ffb6c1",lightsalmon:"ffa07a",lightseagreen:"20b2aa",lightskyblue:"87cefa",lightslategray:"778899",lightslategrey:"778899",lightsteelblue:"b0c4de",lightyellow:"ffffe0",lime:"00ff00",limegreen:"32cd32",linen:"faf0e6",magenta:"ff00ff",maroon:"800000",mediumaquamarine:"66cdaa",mediumblue:"0000cd",mediumorchid:"ba55d3",mediumpurple:"9370d8",mediumseagreen:"3cb371",mediumslateblue:"7b68ee",mediumspringgreen:"00fa9a",mediumturquoise:"48d1cc",mediumvioletred:"c71585",midnightblue:"191970",mintcream:"f5fffa",mistyrose:"ffe4e1",moccasin:"ffe4b5",navajowhite:"ffdead",navy:"000080",oldlace:"fdf5e6",olive:"808000",olivedrab:"6b8e23",orange:"ffa500",orangered:"ff4500",orchid:"da70d6",palegoldenrod:"eee8aa",palegreen:"98fb98",paleturquoise:"afeeee",palevioletred:"d87093",papayawhip:"ffefd5",peachpuff:"ffdab9",peru:"cd853f",pink:"ffc0cb",plum:"dda0dd",powderblue:"b0e0e6",purple:"800080",rebeccapurple:"663399",red:"ff0000",rosybrown:"bc8f8f",royalblue:"4169e1",saddlebrown:"8b4513",salmon:"fa8072",sandybrown:"f4a460",seagreen:"2e8b57",seashell:"fff5ee",sienna:"a0522d",silver:"c0c0c0",skyblue:"87ceeb",slateblue:"6a5acd",slategray:"708090",slategrey:"708090",snow:"fffafa",springgreen:"00ff7f",steelblue:"4682b4",tan:"d2b48c",teal:"008080",thistle:"d8bfd8",tomato:"ff6347",turquoise:"40e0d0",violet:"ee82ee",wheat:"f5deb3",white:"ffffff",whitesmoke:"f5f5f5",yellow:"ffff00",yellowgreen:"9acd32",grey50:"fafafa",grey100:"f5f5f5",grey200:"eeeeee",grey300:"e0e0e0",grey400:"bdbdbd",grey500:"9e9e9e",grey600:"757575",grey700:"616161",grey800:"424242",grey900:"212121",gray50:"fafafa",gray100:"f5f5f5",gray200:"eeeeee",gray300:"e0e0e0",gray400:"bdbdbd",gray500:"9e9e9e",gray600:"757575",gray700:"616161",gray800:"424242",gray900:"212121",bluegrey50:"eceff1",bluegrey100:"CFD8DC",bluegrey200:"B0BEC5",bluegrey300:"90A4AE",bluegrey400:"78909C",bluegrey500:"607D8B",bluegrey600:"546E7A",bluegrey700:"455A64",bluegrey800:"37474F",bluegrey900:"263238",bluegray50:"eceff1",bluegray100:"CFD8DC",bluegray200:"B0BEC5",bluegray300:"90A4AE",bluegray400:"78909C",bluegray500:"607D8B",bluegray600:"546E7A",bluegray700:"455A64",bluegray800:"37474F",bluegray900:"263238",red50:"FFEBEE",red100:"FFCDD2",red200:"EF9A9A",red300:"E57373",red400:"EF5350",red500:"F44336",red600:"E53935",red700:"D32F2F",red800:"C62828",red900:"B71C1C",reda100:"FF8A80",reda200:"FF5252",reda400:"FF1744",reda700:"D50000",pink50:"FCE4EC",pink100:"F8BBD0",pink200:"F48FB1",pink300:"F06292",pink400:"EC407A",pink500:"E91E63",pink600:"D81B60",pink700:"C2185B",pink800:"AD1457",pink900:"880E4F",pinka100:"FF80AB",pinka200:"FF4081",pinka400:"F50057",pinka700:"C51162",purple50:"F3E5F5",purple100:"E1BEE7",purple200:"CE93D8",purple300:"BA68C8",purple400:"AB47BC",purple500:"9C27B0",purple600:"8E24AA",purple700:"7B1FA2",purple800:"6A1B9A",purple900:"4A148C",purplea100:"EA80FC",purplea200:"E040FB",purplea400:"D500F9",purplea700:"AA00FF",deeppurple50:"EDE7F6",deeppurple100:"D1C4E9",deeppurple200:"B39DDB",deeppurple300:"9575CD",deeppurple400:"7E57C2",deeppurple500:"673AB7",deeppurple600:"5E35B1",deeppurple700:"512DA8",deeppurple800:"4527A0",deeppurple900:"311B92",deeppurplea100:"B388FF",deeppurplea200:"7C4DFF",deeppurplea400:"651FFF",deeppurplea700:"6200EA",indigo50:"E8EAF6",indigo100:"C5CAE9",indigo200:"9FA8DA",indigo300:"7986CB",indigo400:"5C6BC0",indigo500:"3F51B5",indigo600:"3949AB",indigo700:"303F9F",indigo800:"283593",indigo900:"1A237E",indigoa100:"8C9EFF",indigoa200:"536DFE",indigoa400:"3D5AFE",indigoa700:"304FFE",blue50:"E3F2FD",blue100:"BBDEFB",blue200:"90CAF9",blue300:"64B5F6",blue400:"42A5F5",blue500:"2196F3",blue600:"1E88E5",blue700:"1976D2",blue800:"1565C0",blue900:"0D47A1",bluea100:"82B1FF",bluea200:"448AFF",bluea400:"2979FF",bluea700:"2962FF",lightblue50:"E1F5FE",lightblue100:"B3E5FC",lightblue200:"81D4FA",lightblue300:"4FC3F7",lightblue400:"29B6F6",lightblue500:"03A9F4",lightblue600:"039BE5",lightblue700:"0288D1",lightblue800:"0277BD",lightblue900:"01579B",lightbluea100:"80D8FF",lightbluea200:"40C4FF",lightbluea400:"00B0FF",lightbluea700:"0091EA",cyan50:"E0F7FA",cyan100:"B2EBF2",cyan200:"80DEEA",cyan300:"4DD0E1",cyan400:"26C6DA",cyan500:"00BCD4",cyan600:"00ACC1",cyan700:"0097A7",cyan800:"00838F",cyan900:"006064",cyana100:"84FFFF",cyana200:"18FFFF",cyana400:"00E5FF",cyana700:"00B8D4",teal50:"E0F2F1",teal100:"B2DFDB",teal200:"80CBC4",teal300:"4DB6AC",teal400:"26A69A",teal500:"009688",teal600:"00897B",teal700:"00796B",teal800:"00695C",teal900:"004D40",teala100:"A7FFEB",teala200:"64FFDA",teala400:"1DE9B6",teala700:"00BFA5",green50:"E8F5E9",green100:"C8E6C9",green200:"A5D6A7",green300:"81C784",green400:"66BB6A",green500:"4CAF50",green600:"43A047",green700:"388E3C",green800:"2E7D32",green900:"1B5E20",greena100:"B9F6CA",greena200:"69F0AE",greena400:"00E676",greena700:"00C853",lightgreen50:"F1F8E9",lightgreen100:"DCEDC8",lightgreen200:"C5E1A5",lightgreen300:"AED581",lightgreen400:"9CCC65",lightgreen500:"8BC34A",lightgreen600:"7CB342",lightgreen700:"689F38",lightgreen800:"558B2F",lightgreen900:"33691E",lightgreena100:"CCFF90",lightgreena200:"B2FF59",lightgreena400:"76FF03",lightgreena700:"64DD17",lime50:"F9FBE7",lime100:"F0F4C3",lime200:"E6EE9C",lime300:"DCE775",lime400:"D4E157",lime500:"CDDC39",lime600:"C0CA33",lime700:"AFB42B",lime800:"9E9D24",lime900:"827717",limea100:"F4FF81",limea200:"EEFF41",limea400:"C6FF00",limea700:"AEEA00",yellow50:"FFFDE7",yellow100:"FFF9C4",yellow200:"FFF59D",yellow300:"FFF176",yellow400:"FFEE58",yellow500:"FFEB3B",yellow600:"FDD835",yellow700:"FBC02D",yellow800:"F9A825",yellow900:"F57F17",yellowa100:"FFFF8D",yellowa200:"FFFF00",yellowa400:"FFEA00",yellowa700:"FFD600",amber50:"FFF8E1",amber100:"FFECB3",amber200:"FFE082",amber300:"FFD54F",amber400:"FFCA28",amber500:"FFC107",amber600:"FFB300",amber700:"FFA000",amber800:"FF8F00",amber900:"FF6F00",ambera100:"FFE57F",ambera200:"FFD740",ambera400:"FFC400",ambera700:"FFAB00",orange50:"FFF3E0",orange100:"FFE0B2",orange200:"FFCC80",orange300:"FFB74D",orange400:"FFA726",orange500:"FF9800",orange600:"FB8C00",orange700:"F57C00",orange800:"EF6C00",orange900:"E65100",orangea100:"FFD180",orangea200:"FFAB40",orangea400:"FF9100",orangea700:"FF6D00",deeporange50:"FBE9E7",deeporange100:"FFCCBC",deeporange200:"FFAB91",deeporange300:"FF8A65",deeporange400:"FF7043",deeporange500:"FF5722",deeporange600:"F4511E",deeporange700:"E64A19",deeporange800:"D84315",deeporange900:"BF360C",deeporangea100:"FF9E80",deeporangea200:"FF6E40",deeporangea400:"FF3D00",deeporangea700:"DD2C00",brown50:"EFEBE9",brown100:"D7CCC8",brown200:"BCAAA4",brown300:"A1887F",brown400:"8D6E63",brown500:"795548",brown600:"6D4C41",brown700:"5D4037",brown800:"4E342E",brown900:"3E2723"},errorReporting:1,modifier:!1,helper:(document.addEventListener("keydown",e=>jsPanel.modifier=e),void document.addEventListener("keyup",()=>jsPanel.modifier=!1)),usePointerEvents(e=!0){e?(this.pointerdown="onpointerdown"in window?["pointerdown"]:"ontouchend"in window?["touchstart","mousedown"]:["mousedown"],this.pointermove="onpointermove"in window?["pointermove"]:"ontouchend"in window?["touchmove","mousemove"]:["mousemove"],this.pointerup="onpointerup"in window?["pointerup"]:"ontouchend"in window?["touchend","mouseup"]:["mouseup"]):(this.pointerdown="ontouchend"in window?["touchstart","mousedown"]:["mousedown"],this.pointermove="ontouchend"in window?["touchmove","mousemove"]:["mousemove"],this.pointerup="ontouchend"in window?["touchend","mouseup"]:["mouseup"]);},pOcontainer(e){if("window"===e)return document.body;if("string"==typeof e){let t=document.querySelectorAll(e);return !!(t.length&&t.length>0)&&t}return 1===e.nodeType?e:!!e.length&&e[0]},pOcontainment(e){let t=e;if("function"==typeof e&&(t=e()),"number"==typeof t)return [t,t,t,t];if(Array.isArray(t)){if(1===t.length)return [t[0],t[0],t[0],t[0]];if(2===t.length)return t.concat(t);3===t.length&&(t[3]=t[1]);}return t},pOsize(e,t){let o=t||this.defaults.contentSize;const n=e.parentElement;if("string"==typeof o){const e=o.trim().split(" ");(o={}).width=e[0],2===e.length?o.height=e[1]:o.height=e[0];}else o.width&&!o.height?o.height=o.width:o.height&&!o.width&&(o.width=o.height);if(String(o.width).match(/^[0-9.]+$/gi))o.width+="px";else if("string"==typeof o.width&&o.width.endsWith("%"))if(n===document.body)o.width=window.innerWidth*(parseFloat(o.width)/100)+"px";else {const e=window.getComputedStyle(n),t=parseFloat(e.borderLeftWidth)+parseFloat(e.borderRightWidth);o.width=(parseFloat(e.width)-t)*(parseFloat(o.width)/100)+"px";}else "function"==typeof o.width&&(o.width=o.width.call(e,e),"number"==typeof o.width?o.width+="px":"string"==typeof o.width&&o.width.match(/^[0-9.]+$/gi)&&(o.width+="px"));if(String(o.height).match(/^[0-9.]+$/gi))o.height+="px";else if("string"==typeof o.height&&o.height.endsWith("%"))if(n===document.body)o.height=window.innerHeight*(parseFloat(o.height)/100)+"px";else {const e=window.getComputedStyle(n),t=parseFloat(e.borderTopWidth)+parseFloat(e.borderBottomWidth);o.height=(parseFloat(e.height)-t)*(parseFloat(o.height)/100)+"px";}else "function"==typeof o.height&&(o.height=o.height.call(e,e),"number"==typeof o.height?o.height+="px":"string"==typeof o.height&&o.height.match(/^[0-9.]+$/gi)&&(o.height+="px"));return o},pOborder(e){let t=[],o=e.trim().replace(/\s*\(\s*/g,"(").replace(/\s*\)/g,")").replace(/\s+/g," ").split(" ");return o.forEach((e,t)=>{(e.startsWith("--")||e.startsWith("var"))&&(o[t]=jsPanel.getCssVariableValue(e));}),o.forEach(e=>{jsPanel.colorNames[e]?t[2]="#"+jsPanel.colorNames[e]:e.match(/(none|hidden|dotted|dashed|solid|double|groove|ridge|inset|outset)/)?t[1]=e:e.match(/(thin|medium|thick)|(\d*\.?\d*(cap|ch|em|ex|ic|lh|rem|rlh|vh|vw|vmax|vmin|vb|vi|px|cm|mm|Q|in|pc|pt))/)?t[0]=e:t[2]=e;}),t[0]||(t[0]="medium"),t[1]||(t[1]="solid"),t[2]||(t[2]=""),t},pOheaderControls(e){if("string"==typeof e){let t={},o=e.toLowerCase(),n=o.match(/xl|lg|md|sm|xs/),a=o.match(/closeonly|none/);return n&&(t.size=n[0]),a&&(t=Object.assign({},t,{maximize:"remove",normalize:"remove",minimize:"remove",smallify:"remove"}),"none"===a[0]&&(t.close="remove")),Object.assign({},this.defaults.headerControls,t)}return Object.assign({},this.defaults.headerControls,e)},pOtheme(e){let t,o="";if((e=e.trim()).match(/^(rgb|hsl|var)/)){let n=e.indexOf(")");(t=e.slice(0,n+1).replace(/\s+/g,"")).startsWith("var")&&(t=jsPanel.getCssVariableValue(t)),o=e.slice(n+1,e.length).trim();}else if(e.match(/^(#|\w|--)/)){let n=e.indexOf(" ");n>0?(t=e.slice(0,n+1).replace(/\s+/g,""),o=e.slice(n+1,e.length).trim()):t=e,t.startsWith("--")&&(t=jsPanel.getCssVariableValue(t));}if(t.match(/^([0-9a-f]{3}|[0-9a-f]{6})$/gi)&&(t="#"+t),o.startsWith("fillcolor")){let e=o.indexOf(" ");o=(o=o.slice(e+1,o.length).trim().replace(/\s+/g,"")).match(/^([0-9a-f]{3}|[0-9a-f]{6})$/gi)?"#"+o:jsPanel.colorNames[o]?"#"+jsPanel.colorNames[o]:o.match(/^(--|var)/)?jsPanel.getCssVariableValue(o):"#fff";}return {color:t,colors:!1,filling:o}},color(e){let t,o,n,a,s,r,l,i,c,d=e.toLowerCase(),p={};const h=/^rgba?\(([0-9]{1,3}),([0-9]{1,3}),([0-9]{1,3}),?(0|1|0\.[0-9]{1,2}|\.[0-9]{1,2})?\)$/gi,f=/^hsla?\(([0-9]{1,3}),([0-9]{1,3}%),([0-9]{1,3}%),?(0|1|0\.[0-9]{1,2}|\.[0-9]{1,2})?\)$/gi,u=this.colorNames;return u[d]&&(d=u[d]),null!==d.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/gi)?((d=d.replace("#","")).length%2==1?(t=d.slice(0,1).repeat(2),o=d.slice(1,2).repeat(2),n=d.slice(2,3).repeat(2),p.rgb={r:parseInt(t,16),g:parseInt(o,16),b:parseInt(n,16)},p.hex=`#${t}${o}${n}`):(p.rgb={r:parseInt(d.slice(0,2),16),g:parseInt(d.slice(2,4),16),b:parseInt(d.slice(4,6),16)},p.hex=`#${d}`),c=this.rgbToHsl(p.rgb.r,p.rgb.g,p.rgb.b),p.hsl=c,p.rgb.css=`rgb(${p.rgb.r},${p.rgb.g},${p.rgb.b})`):d.match(h)?(l=h.exec(d),p.rgb={css:d,r:l[1],g:l[2],b:l[3]},p.hex=this.rgbToHex(l[1],l[2],l[3]),c=this.rgbToHsl(l[1],l[2],l[3]),p.hsl=c):d.match(f)?(a=(l=f.exec(d))[1]/360,s=l[2].slice(0,l[2].length-1)/100,r=l[3].slice(0,l[3].length-1)/100,i=this.hslToRgb(a,s,r),p.rgb={css:`rgb(${i[0]},${i[1]},${i[2]})`,r:i[0],g:i[1],b:i[2]},p.hex=this.rgbToHex(p.rgb.r,p.rgb.g,p.rgb.b),p.hsl={css:`hsl(${l[1]},${l[2]},${l[3]})`,h:l[1],s:l[2],l:l[3]}):(p.hex="#f5f5f5",p.rgb={css:"rgb(245,245,245)",r:245,g:245,b:245},p.hsl={css:"hsl(0,0%,96%)",h:0,s:"0%",l:"96%"}),p},calcColors(e){const t=this.colorBrightnessThreshold,o=this.color(e),n=this.lighten(e,this.colorFilledLight),a=this.darken(e,this.colorFilled),s=this.perceivedBrightness(e)<=t?"#ffffff":"#000000",r=this.perceivedBrightness(n)<=t?"#ffffff":"#000000",l=this.perceivedBrightness(a)<=t?"#ffffff":"#000000",i=this.lighten(e,this.colorFilledDark),c=this.perceivedBrightness(i)<=t?"#ffffff":"#000000";return [o.hsl.css,n,a,s,r,l,i,c]},darken(e,t){const o=this.color(e).hsl,n=parseFloat(o.l),a=Math.round(n-n*t)+"%";return `hsl(${o.h},${o.s},${a})`},lighten(e,t){const o=this.color(e).hsl,n=parseFloat(o.l),a=Math.round(n+(100-n)*t)+"%";return `hsl(${o.h},${o.s},${a})`},hslToRgb(e,t,o){let n,a,s;if(0===t)n=a=s=o;else {let r=(e,t,o)=>(o<0&&(o+=1),o>1&&(o-=1),o<1/6?e+6*(t-e)*o:o<.5?t:o<2/3?e+(t-e)*(2/3-o)*6:e),l=o<.5?o*(1+t):o+t-o*t,i=2*o-l;n=r(i,l,e+1/3),a=r(i,l,e),s=r(i,l,e-1/3);}return [Math.round(255*n),Math.round(255*a),Math.round(255*s)]},rgbToHsl(e,t,o){e/=255,t/=255,o/=255;let n,a,s=Math.max(e,t,o),r=Math.min(e,t,o),l=(s+r)/2;if(s===r)n=a=0;else {let i=s-r;switch(a=l>.5?i/(2-s-r):i/(s+r),s){case e:n=(t-o)/i+(t<o?6:0);break;case t:n=(o-e)/i+2;break;case o:n=(e-t)/i+4;}n/=6;}return {css:"hsl("+(n=Math.round(360*n))+","+(a=Math.round(100*a)+"%")+","+(l=Math.round(100*l)+"%")+")",h:n,s:a,l:l}},rgbToHex(e,t,o){let n=Number(e).toString(16),a=Number(t).toString(16),s=Number(o).toString(16);return 1===n.length&&(n=`0${n}`),1===a.length&&(a=`0${a}`),1===s.length&&(s=`0${s}`),`#${n}${a}${s}`},perceivedBrightness(e){const t=this.color(e).rgb;return t.r/255*.2126+t.g/255*.7152+t.b/255*.0722},pOposition(e){let t={},o=e.trim().split(/\s+/),n=o.filter(e=>e.match(/^(down|right|up|left)$/i));n.length&&(t.autoposition=n[0],o.splice(o.indexOf(n[0]),1));let a=o.filter(e=>e.match(/^(left-|right-)(top|center|bottom)$|(^center-)(top|bottom)$|(^center$)/i));a.length?(t.my=a[0],t.at=a[1]||a[0],o.splice(o.indexOf(a[0]),1),a[1]&&o.splice(o.indexOf(a[1]),1)):(t.my="center",t.at="center");let s=o.filter(e=>e.match(/^[+-]?\d*\.?\d+[a-z%]*$/i));return s.length&&(t.offsetX=s[0].match(/^[+-]?\d*\.?\d+$/i)?`${s[0]}px`:s[0],s[1]?t.offsetY=s[1].match(/^[+-]?\d*\.?\d+$/i)?`${s[1]}px`:s[1]:t.offsetY=t.offsetX,o.splice(o.indexOf(s[0]),1),s[1]&&o.splice(o.indexOf(s[1]),1)),o.length&&(t.of=o.join(" ")),t},position(e,t){if(!t)return e.style.opacity=1,e;t="string"==typeof t?Object.assign({},this.defaults.position,this.pOposition(t)):Object.assign({},this.defaults.position,t),["my","at","of"].forEach(o=>{"function"==typeof t[o]&&(t[o]=t[o].call(e,e));}),"window"===e.options.container&&(e.style.position="fixed"),"string"==typeof e?e=document.querySelector(e):Object.getPrototypeOf(e).jquery&&(e=e[0]);const o="window"===e.options.container?"window":e.parentElement,n=e.getBoundingClientRect(),a=e.parentElement.getBoundingClientRect(),s="window"===o?{left:0,top:0,width:document.documentElement.clientWidth,height:window.innerHeight}:{width:a.width,height:a.height,left:a.left,top:a.top},r="window"===o?{x:1,y:1}:{x:s.width/o.offsetWidth,y:s.height/o.offsetHeight},l="window"===o?{borderTopWidth:"0px",borderRightWidth:"0px",borderBottomWidth:"0px",borderLeftWidth:"0px"}:window.getComputedStyle(o);let i;s.width-=(parseFloat(l.borderLeftWidth)+parseFloat(l.borderRightWidth))*r.x,s.height-=(parseFloat(l.borderTopWidth)+parseFloat(l.borderBottomWidth))*r.y,i=t.of?"string"==typeof t.of?"window"===t.of?{borderTopWidth:"0px",borderRightWidth:"0px",borderBottomWidth:"0px",borderLeftWidth:"0px"}:document.querySelector(t.of).getBoundingClientRect():Object.getPrototypeOf(t.of).jquery?t.of[0].getBoundingClientRect():t.of.getBoundingClientRect():s;let c=this.getScrollbarWidth(document.body),d=this.getScrollbarWidth(e.parentElement),p="0px";t.my.startsWith("left-")?t.at.startsWith("left-")?p=t.of?i.left-s.left-parseFloat(l.borderLeftWidth)+"px":"0px":t.at.startsWith("center")?p=t.of?i.left-s.left-parseFloat(l.borderLeftWidth)+i.width/2+"px":s.width/2+"px":t.at.startsWith("right-")&&(p=t.of?i.left-s.left-parseFloat(l.borderLeftWidth)+i.width+"px":s.width+"px"):t.my.startsWith("center")?t.at.startsWith("left-")?p=t.of?i.left-s.left-parseFloat(l.borderLeftWidth)-n.width/2+"px":-n.width/2+"px":t.at.startsWith("center")?p=t.of?i.left-s.left-parseFloat(l.borderLeftWidth)-(n.width-i.width)/2+"px":s.width/2-n.width/2+"px":t.at.startsWith("right-")&&(p=t.of?i.left-s.left-parseFloat(l.borderLeftWidth)+(i.width-n.width/2)+"px":s.width-n.width/2+"px"):t.my.startsWith("right-")&&(t.at.startsWith("left-")?p=t.of?i.left-s.left-parseFloat(l.borderLeftWidth)-n.width+"px":-n.width+"px":t.at.startsWith("center")?p=t.of?i.left-s.left-parseFloat(l.borderLeftWidth)-n.width+i.width/2+"px":s.width/2-n.width+"px":t.at.startsWith("right-")&&(p=t.of?i.left-s.left-parseFloat(l.borderLeftWidth)+i.width-n.width+"px":s.width-n.width+"px","window"!==o&&(p=parseFloat(p)-d.y+"px")));let h="0px";t.my.endsWith("-top")?t.at.endsWith("-top")?h=t.of?i.top-s.top-parseFloat(l.borderTopWidth)+"px":"0px":t.at.endsWith("center")?h=t.of?i.top-s.top-parseFloat(l.borderTopWidth)+i.height/2+"px":s.height/2+"px":t.at.endsWith("-bottom")&&(h=t.of?i.top-s.top-parseFloat(l.borderTopWidth)+i.height+"px":s.height+"px"):t.my.endsWith("center")?t.at.endsWith("-top")?h=t.of?i.top-s.top-parseFloat(l.borderTopWidth)-n.height/2+"px":-n.height/2+"px":t.at.endsWith("center")?h=t.of?i.top-s.top-parseFloat(l.borderTopWidth)-n.height/2+i.height/2+"px":s.height/2-n.height/2+"px":t.at.endsWith("-bottom")&&(h=t.of?i.top-s.top-parseFloat(l.borderTopWidth)-n.height/2+i.height+"px":s.height-n.height/2+"px"):t.my.endsWith("-bottom")&&(t.at.endsWith("-top")?h=t.of?i.top-s.top-parseFloat(l.borderTopWidth)-n.height+"px":-n.height+"px":t.at.endsWith("center")?h=t.of?i.top-s.top-parseFloat(l.borderTopWidth)-n.height+i.height/2+"px":s.height/2-n.height+"px":t.at.endsWith("-bottom")&&(h=t.of?i.top-s.top-parseFloat(l.borderTopWidth)-n.height+i.height+"px":s.height-n.height+"px",h="window"!==o?parseFloat(h)-d.x+"px":parseFloat(h)-c.x+"px")),e.style.left=1===r.x?p:parseFloat(p)/r.x+"px",e.style.top=1===r.y?h:parseFloat(h)/r.y+"px";let f=getComputedStyle(e),u={left:f.left,top:f.top};return t.autoposition&&t.my===t.at&&["left-top","center-top","right-top","left-bottom","center-bottom","right-bottom"].indexOf(t.my)>=0&&(u=this.applyPositionAutopos(e,u,t)),(t.offsetX||t.offsetY)&&(u=this.applyPositionOffset(e,u,t)),(t.minLeft||t.minTop||t.maxLeft||t.maxTop)&&(u=this.applyPositionMinMax(e,u,t)),t.modify&&(u=this.applyPositionModify(e,u,t)),"number"==typeof e.options.opacity?e.style.opacity=e.options.opacity:e.style.opacity=1,e},applyPositionAutopos(e,t,o){const n=`${o.my}-${o.autoposition.toLowerCase()}`;e.classList.add(n);const a=Array.prototype.slice.call(document.querySelectorAll(`.${n}`)),s=a.indexOf(e);if(a.length>1){switch(o.autoposition){case"down":a.forEach((e,o)=>{o>0&&o<=s&&(t.top=parseFloat(t.top)+a[--o].getBoundingClientRect().height+jsPanel.autopositionSpacing+"px");});break;case"up":a.forEach((e,o)=>{o>0&&o<=s&&(t.top=parseFloat(t.top)-a[--o].getBoundingClientRect().height-jsPanel.autopositionSpacing+"px");});break;case"right":a.forEach((e,o)=>{o>0&&o<=s&&(t.left=parseFloat(t.left)+a[--o].getBoundingClientRect().width+jsPanel.autopositionSpacing+"px");});break;case"left":a.forEach((e,o)=>{o>0&&o<=s&&(t.left=parseFloat(t.left)-a[--o].getBoundingClientRect().width-jsPanel.autopositionSpacing+"px");});}e.style.left=t.left,e.style.top=t.top;}return {left:t.left,top:t.top}},applyPositionOffset(e,t,o){["offsetX","offsetY"].forEach(e=>{o[e]?("function"==typeof o[e]&&(o[e]=o[e].call(t,t,o)),!1===isNaN(o[e])&&(o[e]=`${o[e]}px`)):o[e]="0px";}),e.style.left=`calc(${e.style.left} + ${o.offsetX})`,e.style.top=`calc(${e.style.top} + ${o.offsetY})`;const n=getComputedStyle(e);return {left:n.left,top:n.top}},applyPositionMinMax(e,t,o){if(["minLeft","minTop","maxLeft","maxTop"].forEach(e=>{o[e]&&("function"==typeof o[e]&&(o[e]=o[e].call(t,t,o)),(Number.isInteger(o[e])||o[e].match(/^\d+$/))&&(o[e]=`${o[e]}px`));}),o.minLeft){e.style.left=o.minLeft;let n=getComputedStyle(e).left;parseFloat(n)<parseFloat(t.left)?e.style.left=t.left:t.left=n;}if(o.minTop){e.style.top=o.minTop;let n=getComputedStyle(e).top;parseFloat(n)<parseFloat(t.top)?e.style.top=t.top:t.top=n;}if(o.maxLeft){e.style.left=o.maxLeft;let n=getComputedStyle(e).left;parseFloat(n)>parseFloat(t.left)?e.style.left=t.left:t.left=n;}if(o.maxTop){e.style.top=o.maxTop;let n=getComputedStyle(e).top;parseFloat(n)>parseFloat(t.top)?e.style.top=t.top:t.top=n;}const n=getComputedStyle(e);return {left:n.left,top:n.top}},applyPositionModify(e,t,o){if(o.modify&&"function"==typeof o.modify){const n=o.modify.call(t,t,o);e.style.left=Number.isInteger(n.left)||n.left.match(/^\d+$/)?`${n.left}px`:n.left,e.style.top=Number.isInteger(n.top)||n.top.match(/^\d+$/)?`${n.top}px`:n.top;}const n=getComputedStyle(e);return {left:n.left,top:n.top}},autopositionRemaining(e){let t,o=e.options.container;if(["left-top-down","left-top-right","center-top-down","right-top-down","right-top-left","left-bottom-up","left-bottom-right","center-bottom-up","right-bottom-up","right-bottom-left"].forEach(o=>{e.classList.contains(o)&&(t=o);}),t){("window"===o?document.body:"string"==typeof o?document.querySelector(o):o).querySelectorAll(`.${t}`).forEach(e=>e.reposition());}},getThemeDetails(e){const t=this.pOtheme(e);if(this.themes.some(e=>e===t.color.split(/\s/i)[0])){let e=t.color.split(/\s/i)[0],o=document.createElement("button");o.className=e+"-bg",document.body.appendChild(o),t.color=getComputedStyle(o).backgroundColor.replace(/\s+/gi,""),document.body.removeChild(o),o=void 0;}else if(t.color.startsWith("bootstrap-")){let e=t.color.indexOf("-"),o=document.createElement("button");o.className="btn btn"+t.color.slice(e),document.body.appendChild(o),t.color=getComputedStyle(o).backgroundColor.replace(/\s+/gi,""),document.body.removeChild(o),o=void 0;}else if(t.color.startsWith("mdb-")){let e,o=t.color.indexOf("-")+1,n=document.createElement("span");e=t.color.endsWith("-dark")?(e=t.color.slice(o)).replace("-dark","-color-dark"):t.color.slice(o)+"-color",n.className=e,document.body.appendChild(n),t.color=getComputedStyle(n).backgroundColor.replace(/\s+/gi,""),document.body.removeChild(n),n=void 0;}return t.colors=this.calcColors(t.color),t},clearTheme(e,t){return this.themes.forEach(t=>{["panel",`jsPanel-theme-${t}`,`panel-${t}`,`${t}-color`].forEach(t=>e.classList.remove(t)),e.header.classList.remove(`jsPanel-theme-${t}`);}),e.content.classList.remove("jsPanel-content-filled","jsPanel-content-filledlight"),e.header.classList.remove("jsPanel-hdr-light"),e.header.classList.remove("jsPanel-hdr-dark"),e.style.backgroundColor="",this.setStyles(e.headertoolbar,{boxShadow:"",width:"",marginLeft:"",borderTopColor:"transparent"}),this.setStyles(e.content,{background:"",borderTopColor:"transparent"}),e.header.style.background="",Array.prototype.slice.call(e.controlbar.querySelectorAll(".jsPanel-icon")).concat([e.headerlogo,e.headertitle,e.headertoolbar,e.content]).forEach(e=>e.style.color=""),t&&t.call(e,e),e},applyColorTheme(e,t){if(e.style.backgroundColor=t.colors[0],e.header.style.backgroundColor=t.colors[0],e.header.style.color=t.colors[3],[".jsPanel-headerlogo",".jsPanel-title",".jsPanel-hdr-toolbar"].forEach(o=>e.querySelector(o).style.color=t.colors[3]),e.querySelectorAll(".jsPanel-controlbar .jsPanel-btn").forEach(e=>e.style.color=t.colors[3]),"string"==typeof e.options.theme&&"filled"===t.filling&&(e.content.style.borderTop="#000000"===t.colors[3]?"1px solid rgba(0,0,0,0.15)":"1px solid rgba(255,255,255,0.15)"),"#000000"===t.colors[3]?e.header.classList.add("jsPanel-hdr-light"):e.header.classList.add("jsPanel-hdr-dark"),t.filling)switch(t.filling){case"filled":this.setStyles(e.content,{backgroundColor:t.colors[2],color:t.colors[3]});break;case"filledlight":e.content.style.backgroundColor=t.colors[1];break;case"filleddark":this.setStyles(e.content,{backgroundColor:t.colors[6],color:t.colors[7]});break;default:e.content.style.backgroundColor=t.filling,e.content.style.color=this.perceivedBrightness(t.filling)<=this.colorBrightnessThreshold?"#fff":"#000";}return e},applyCustomTheme(e,t){let o={bgPanel:"#ffffff",bgContent:"#fffffff",bgFooter:"#f5f5f5",colorHeader:"#000000",colorContent:"#000000",colorFooter:"#000000",border:void 0,borderRadius:void 0},n="object"==typeof t?Object.assign(o,t):o,a=n.bgPanel,s=n.bgContent,r=n.colorHeader,l=n.colorContent,i=n.bgFooter,c=n.colorFooter;return this.colorNames[a]?e.style.background="#"+this.colorNames[a]:e.style.background=this.getCssVariableValue(a),this.colorNames[r]&&(r="#"+this.colorNames[r]),[".jsPanel-headerlogo",".jsPanel-title",".jsPanel-hdr-toolbar"].forEach(t=>e.querySelector(t).style.color=this.getCssVariableValue(r)),e.querySelectorAll(".jsPanel-controlbar .jsPanel-btn").forEach(e=>e.style.color=this.getCssVariableValue(r)),this.colorNames[s]?e.content.style.background="#"+this.colorNames[s]:e.content.style.background=this.getCssVariableValue(s),this.colorNames[l]?e.content.style.color="#"+this.colorNames[l]:e.content.style.color=this.getCssVariableValue(l),this.perceivedBrightness(r)>this.colorBrightnessThreshold?e.header.classList.add("jsPanel-hdr-dark"):e.header.classList.add("jsPanel-hdr-light"),this.perceivedBrightness(l)>this.colorBrightnessThreshold?e.content.style.borderTop="1px solid rgba(255,255,255,0.15)":e.content.style.borderTop="1px solid rgba(0,0,0,0.15)",this.colorNames[i]?e.footer.style.background="#"+this.colorNames[i]:e.footer.style.background=this.getCssVariableValue(i),this.colorNames[c]?e.footer.style.color="#"+this.colorNames[c]:e.footer.style.color=this.getCssVariableValue(c),n.border&&e.setBorder(n.border),n.borderRadius&&(e.options.borderRadius=void 0,e.setBorderRadius(n.borderRadius)),e},getCssVariableValue(e){if(e.startsWith("--"))return getComputedStyle(document.documentElement).getPropertyValue(e).replace(/\s+/g,"");if(e.startsWith("var")){let t=e.slice(e.indexOf("(")+1,e.indexOf(")"));return getComputedStyle(document.documentElement).getPropertyValue(t).replace(/\s+/g,"")}return e},getScrollbarWidth(e=document.body){if(e===document.body)return {y:window.innerWidth-document.documentElement.clientWidth,x:window.innerHeight-document.documentElement.clientHeight};{let t=getComputedStyle(e);return {y:e.offsetWidth-e.clientWidth-parseFloat(t.borderRightWidth)-parseFloat(t.borderLeftWidth),x:e.offsetHeight-e.clientHeight-parseFloat(t.borderBottomWidth)-parseFloat(t.borderTopWidth)}}},remClass:(e,t)=>(t.trim().split(/\s+/).forEach(t=>e.classList.remove(t)),e),setClass:(e,t)=>(t.trim().split(/\s+/).forEach(t=>e.classList.add(t)),e),setStyles(e,t){for(const[o,n]of Object.entries(t))e.style[o]="string"==typeof n?jsPanel.getCssVariableValue(n):n;return e},setStyle(e,t){return this.setStyles.call(e,e,t)},strToHtml:e=>document.createRange().createContextualFragment(e),toggleClass:(e,t)=>(t.trim().split(/\s+/).forEach(t=>e.classList.contains(t)?e.classList.remove(t):e.classList.add(t)),e),emptyNode(e){for(;e.firstChild;)e.removeChild(e.firstChild);return e},addScript(e,t="application/javascript",o){if(!document.querySelector(`script[src="${e}"]`)){const n=document.createElement("script");n.src=e,n.type=t,document.head.appendChild(n),o&&(n.onload=o);}},ajax(e,t){let o,n,a=new XMLHttpRequest;const s={method:"GET",async:!0,user:"",pwd:"",done:function(){if(t){let e=jsPanel.strToHtml(this.responseText);o.urlSelector&&(e=e.querySelector(o.urlSelector)),t.contentRemove(),t.content.append(e);}},autoresize:!0,autoreposition:!0};if(t&&"string"==typeof e)o=Object.assign({},s,{url:e});else {if("object"!=typeof e||!e.url){if(this.errorReporting){let e="XMLHttpRequest seems to miss the <mark>url</mark> parameter!";jsPanel.errorpanel(e);}return}(o=Object.assign({},s,e)).url=e.url,!1===o.async&&(o.timeout=0,o.withCredentials&&(o.withCredentials=void 0),o.responseType&&(o.responseType=void 0));}n=o.url.trim().split(/\s+/),o.url=encodeURI(n[0]),n.length>1&&(n.shift(),o.urlSelector=n.join(" ")),a.onreadystatechange=(()=>{4===a.readyState&&(200===a.status?t?o.done.call(a,a,t):o.done.call(a,a):o.fail&&(t?o.fail.call(a,a,t):o.fail.call(a,a)),o.always&&(t?o.always.call(a,a,t):o.always.call(a,a)),t&&(o.autoresize||o.autoreposition)&&jsPanel.ajaxAutoresizeAutoreposition(t,o),jsPanel.ajaxAlwaysCallbacks.length&&jsPanel.ajaxAlwaysCallbacks.forEach(e=>{t?e.call(a,a,t):e.call(a,a);}));}),a.open(o.method,o.url,o.async,o.user,o.pwd),a.timeout=o.timeout||0,o.withCredentials&&(a.withCredentials=o.withCredentials),o.responseType&&(a.responseType=o.responseType),o.beforeSend&&(t?o.beforeSend.call(a,a,t):o.beforeSend.call(a,a)),o.data?a.send(o.data):a.send(null);},fetch(e,t){let o;const n={bodyMethod:"text",autoresize:!0,autoreposition:!0,done:function(e,t){if(t){let o=jsPanel.strToHtml(e);t.contentRemove(),t.content.append(o);}}};if(t&&"string"==typeof e)o=Object.assign({},n,{resource:encodeURI(e)});else {if("object"!=typeof e||!e.resource){if(this.errorReporting){let e="Fetch Request seems to miss the <mark>resource</mark> parameter!";jsPanel.errorpanel(e);}return}(o=Object.assign({},n,e)).resource=encodeURI(e.resource);}const a=o.fetchInit||{};o.beforeSend&&(t?o.beforeSend.call(e,e,t):o.beforeSend.call(e,e)),fetch(o.resource,a).then(e=>{if(e.ok)return e[o.bodyMethod]()}).then(e=>{t?o.done.call(e,e,t):o.done.call(e,e),t&&(o.autoresize||o.autoreposition)&&jsPanel.ajaxAutoresizeAutoreposition(t,o);});},ajaxAutoresizeAutoreposition(e,t){const o=e.options.contentSize;if("string"==typeof o&&o.match(/auto/i)){const n=o.split(" "),a=Object.assign({},{width:n[0],height:n[1]});t.autoresize&&e.resize(a),e.classList.contains("jsPanel-contextmenu")||t.autoreposition&&e.reposition();}else if("object"==typeof o&&("auto"===o.width||"auto"===o.height)){const n=Object.assign({},o);t.autoresize&&e.resize(n),e.classList.contains("jsPanel-contextmenu")||t.autoreposition&&e.reposition();}},createPanelTemplate(e=!0){const t=document.createElement("div");return t.className="jsPanel",t.style.left="0",t.style.top="0",e&&["close","maximize","normalize","minimize","smallify"].forEach(e=>{t.setAttribute(`data-btn${e}`,"enabled");}),t.innerHTML=`<div class="jsPanel-hdr">\n                                <div class="jsPanel-headerbar">\n                                    <div class="jsPanel-headerlogo"></div>\n                                    <div class="jsPanel-titlebar">\n                                        <div class="jsPanel-title"></div>\n                                    </div>\n                                    <div class="jsPanel-controlbar">\n                                        <button type="button" class="jsPanel-btn jsPanel-btn-smallify" aria-label="Smallify">${this.icons.smallify}</button>\n                                        <button type="button" class="jsPanel-btn jsPanel-btn-minimize" aria-label="Minimize">${this.icons.minimize}</button>\n                                        <button type="button" class="jsPanel-btn jsPanel-btn-normalize" aria-label="Normalize">${this.icons.normalize}</button>\n                                        <button type="button" class="jsPanel-btn jsPanel-btn-maximize" aria-label="Maximize">${this.icons.maximize}</button>\n                                        <button type="button" class="jsPanel-btn jsPanel-btn-close" aria-label="Close">${this.icons.close}</button>\n                                    </div>\n                                </div>\n                                <div class="jsPanel-hdr-toolbar"></div>\n                            </div>\n                            <div class="jsPanel-progressbar">\n                                <div class="jsPanel-progressbar-slider"></div>\n                            </div>\n                            <div class="jsPanel-content"></div>\n                            <div class="jsPanel-minimized-box"></div>\n                            <div class="jsPanel-ftr"></div>`,t},createMinimizedTemplate(){const e=document.createElement("div");return e.className="jsPanel-replacement",e.innerHTML=`<div class="jsPanel-hdr">\n                                <div class="jsPanel-headerbar">\n                                    <div class="jsPanel-headerlogo"></div>\n                                    <div class="jsPanel-titlebar">\n                                        <div class="jsPanel-title"></div>\n                                    </div>\n                                    <div class="jsPanel-controlbar">\n                                        <button type="button" class="jsPanel-btn jsPanel-btn-sm jsPanel-btn-normalize" aria-label="Normalize">${this.icons.normalize}</button>\n                                        <button type="button" class="jsPanel-btn jsPanel-btn-sm jsPanel-btn-maximize" aria-label="Maximize">${this.icons.maximize}</button>\n                                        <button type="button" class="jsPanel-btn jsPanel-btn-sm jsPanel-btn-close" aria-label="Close">${this.icons.close}</button>\n                                    </div>\n                                </div>\n                            </div>`,e},createSnapArea(e,t,o){const n=document.createElement("div"),a=e.parentElement;n.className=`jsPanel-snap-area jsPanel-snap-area-${t}`,"lt"===t||"rt"===t||"rb"===t||"lb"===t?(n.style.width=o+"px",n.style.height=o+"px"):"ct"===t||"cb"===t?n.style.height=o+"px":"lc"!==t&&"rc"!==t||(n.style.width=o+"px"),a!==document.body&&(n.style.position="absolute"),document.querySelector(`.jsPanel-snap-area.jsPanel-snap-area-${t}`)||e.parentElement.appendChild(n);},removeSnapAreas(){document.querySelectorAll(".jsPanel-snap-area").forEach(e=>e.parentElement.removeChild(e));},extend(e){if("[object Object]"===Object.prototype.toString.call(e))for(let t in e)Object.prototype.hasOwnProperty.call(e,t)&&(this.extensions[t]=e[t]);},getPanels:(e=function(){return this.classList.contains("jsPanel-standard")})=>Array.prototype.slice.call(document.querySelectorAll(".jsPanel")).filter(t=>e.call(t,t)).sort((e,t)=>t.style.zIndex-e.style.zIndex),processCallbacks(e,t,o="some",n,a){if("function"==typeof t&&(t=[t]),o)return t[o](t=>t.call(e,e,n,a));t.forEach(t=>t.call(e,e,n,a));},resetZi(){this.zi=((e=jsPanel.ziBase)=>{let t=e;return {next:()=>t++}})(),Array.prototype.slice.call(document.querySelectorAll(".jsPanel-standard")).sort((e,t)=>e.style.zIndex-t.style.zIndex).forEach(e=>e.style.zIndex=jsPanel.zi.next());},errorpanel(e){this.create({paneltype:"error",dragit:!1,resizeit:!1,theme:{bgPanel:"white",bgContent:"white",colorHeader:"rebeccapurple",colorContent:"#333333",border:"2px solid rebeccapurple"},borderRadius:".33rem",headerControls:"closeonly xs",headerTitle:"&#9888; jsPanel Error",contentSize:{width:"50%",height:"auto"},position:"center-top 0 5 down",animateIn:"jsPanelFadeIn",content:`<div class="jsPanel-error-content-separator"></div><p>${e}</p>`});},create(e={},t){jsPanel.zi||(jsPanel.zi=((e=jsPanel.ziBase)=>{let t=e;return {next:()=>t++}})()),e.config?delete(e=Object.assign({},this.defaults,e.config,e)).config:e=Object.assign({},this.defaults,e),e.id?"function"==typeof e.id&&(e.id=e.id()):e.id=`jsPanel-${jsPanel.idCounter+=1}`;const o=document.getElementById(e.id);if(null!==o){if(o.classList.contains("jsPanel")&&o.front(),this.errorReporting){let t=`&#9664; COULD NOT CREATE NEW JSPANEL &#9658;<br>An element with the ID <mark>${e.id}</mark> already exists in the document.`;jsPanel.errorpanel(t);}return !1}let n=this.pOcontainer(e.container);if("object"==typeof n&&n.length&&n.length>0&&(n=n[0]),!n){if(this.errorReporting){let e="&#9664; COULD NOT CREATE NEW JSPANEL &#9658;<br>The container to append the panel to does not exist";jsPanel.errorpanel(e);}return !1}["onbeforeclose","onbeforemaximize","onbeforeminimize","onbeforenormalize","onbeforesmallify","onbeforeunsmallify","onclosed","onfronted","onmaximized","onminimized","onnormalized","onsmallified","onstatuschange","onunsmallified"].forEach(t=>{e[t]?"function"==typeof e[t]&&(e[t]=[e[t]]):e[t]=[];});const a=e.template||this.createPanelTemplate();a.options=e,a.closetimer=void 0,a.status="initialized",a.currentData={},a.header=a.querySelector(".jsPanel-hdr"),a.headerbar=a.header.querySelector(".jsPanel-headerbar"),a.titlebar=a.header.querySelector(".jsPanel-titlebar"),a.headerlogo=a.headerbar.querySelector(".jsPanel-headerlogo"),a.headertitle=a.headerbar.querySelector(".jsPanel-title"),a.controlbar=a.headerbar.querySelector(".jsPanel-controlbar"),a.headertoolbar=a.header.querySelector(".jsPanel-hdr-toolbar"),a.content=a.querySelector(".jsPanel-content"),a.footer=a.querySelector(".jsPanel-ftr"),a.snappableTo=!1,a.snapped=!1,a.droppableTo=!1,a.progressbar=a.autocloseProgressbar=a.querySelector(".jsPanel-progressbar");const s=new CustomEvent("jspanelloaded",{detail:e.id,cancelable:!0}),r=new CustomEvent("jspanelstatuschange",{detail:e.id,cancelable:!0}),l=new CustomEvent("jspanelbeforenormalize",{detail:e.id,cancelable:!0}),i=new CustomEvent("jspanelnormalized",{detail:e.id,cancelable:!0}),c=new CustomEvent("jspanelbeforemaximize",{detail:e.id,cancelable:!0}),d=new CustomEvent("jspanelmaximized",{detail:e.id,cancelable:!0}),p=new CustomEvent("jspanelbeforeminimize",{detail:e.id,cancelable:!0}),h=new CustomEvent("jspanelminimized",{detail:e.id,cancelable:!0}),f=new CustomEvent("jspanelbeforesmallify",{detail:e.id,cancelable:!0}),u=new CustomEvent("jspanelsmallified",{detail:e.id,cancelable:!0}),m=new CustomEvent("jspanelsmallifiedmax",{detail:e.id,cancelable:!0}),g=new CustomEvent("jspanelbeforeunsmallify",{detail:e.id,cancelable:!0}),b=new CustomEvent("jspanelfronted",{detail:e.id,cancelable:!0}),y=new CustomEvent("jspanelbeforeclose",{detail:e.id,cancelable:!0}),w=new CustomEvent("jspanelclosed",{detail:e.id,cancelable:!0}),v=new CustomEvent("jspanelcloseduser",{detail:e.id,cancelable:!0});[s,r,l,i,c,d,p,h,f,u,m,g,b,y].forEach(e=>e.panel=a);const j=a.querySelector(".jsPanel-btn-close"),x=a.querySelector(".jsPanel-btn-maximize"),E=a.querySelector(".jsPanel-btn-normalize"),C=a.querySelector(".jsPanel-btn-smallify"),P=a.querySelector(".jsPanel-btn-minimize");j&&jsPanel.pointerup.forEach(e=>{j.addEventListener(e,e=>{if(e.preventDefault(),e.button&&e.button>0)return !1;a.close(null,!0);});}),x&&jsPanel.pointerup.forEach(e=>{x.addEventListener(e,e=>{if(e.preventDefault(),e.button&&e.button>0)return !1;a.maximize();});}),E&&jsPanel.pointerup.forEach(e=>{E.addEventListener(e,e=>{if(e.preventDefault(),e.button&&e.button>0)return !1;a.normalize();});}),C&&jsPanel.pointerup.forEach(e=>{C.addEventListener(e,e=>{if(e.preventDefault(),e.button&&e.button>0)return !1;"normalized"===a.status||"maximized"===a.status?a.smallify():"smallified"!==a.status&&"smallifiedmax"!==a.status||a.unsmallify();});}),P&&jsPanel.pointerup.forEach(e=>{P.addEventListener(e,e=>{if(e.preventDefault(),e.button&&e.button>0)return !1;a.minimize();});});let F=jsPanel.extensions;for(let e in F)Object.prototype.hasOwnProperty.call(F,e)&&(a[e]=F[e]);if(a.setBorder=(e=>{let t=jsPanel.pOborder(e);return t[2].length||(t[2]=a.style.backgroundColor),t=t.join(" "),a.style.border=t,a.options.border=t,a}),a.setBorderRadius=(e=>{"string"==typeof e&&(e.startsWith("--")||e.startsWith("var"))&&(e=e.replace(/\s*\(\s*/g,"(").replace(/\s*\)/g,")").replace(/\s+/g," "),e=jsPanel.getCssVariableValue(e)),"number"==typeof e&&(e+="px"),a.style.borderRadius=e;const t=getComputedStyle(a);return a.options.header?(a.header.style.borderTopLeftRadius=t.borderTopLeftRadius,a.header.style.borderTopRightRadius=t.borderTopRightRadius):(a.content.style.borderTopLeftRadius=t.borderTopLeftRadius,a.content.style.borderTopRightRadius=t.borderTopRightRadius),a.options.footerToolbar?(a.footer.style.borderBottomRightRadius=t.borderBottomRightRadius,a.footer.style.borderBottomLeftRadius=t.borderBottomLeftRadius):(a.content.style.borderBottomRightRadius=t.borderBottomRightRadius,a.content.style.borderBottomLeftRadius=t.borderBottomLeftRadius),a}),a.setTheme=((t=e.theme,o)=>{let n;if("minimized"===a.status&&(n=!0,a.normalize()),jsPanel.clearTheme(a),"object"==typeof t)e.border=void 0,jsPanel.applyCustomTheme(a,t);else if("string"==typeof t){"none"===t&&(t="white");let e=jsPanel.getThemeDetails(t);jsPanel.applyColorTheme(a,e);}return n&&a.minimize(),o&&o.call(a,a),a}),a.remove=((e,t,o)=>{a.parentElement.removeChild(a),document.getElementById(e)?o&&o.call(a,e,a):(a.removeMinimizedReplacement(),a.status="closed",t&&document.dispatchEvent(v),document.dispatchEvent(w),a.options.onclosed&&jsPanel.processCallbacks(a,a.options.onclosed,"every",t),jsPanel.autopositionRemaining(a),o&&o.call(e,e)),window.removeEventListener("resize",a.windowResizeHandler),document.removeEventListener("jspanelresize",a.parentResizeHandler);}),a.close=((e,t)=>{if(a.parentElement){if(a.closetimer&&window.clearInterval(a.closetimer),document.dispatchEvent(y),a.statusBefore=a.status,a.options.onbeforeclose&&a.options.onbeforeclose.length>0&&!jsPanel.processCallbacks(a,a.options.onbeforeclose,"some",a.status,t))return a;a.options.animateOut?(a.options.animateIn&&jsPanel.remClass(a,a.options.animateIn),jsPanel.setClass(a,a.options.animateOut),a.addEventListener("animationend",o=>{o.stopPropagation(),a.remove(a.id,t,e);})):a.remove(a.id,t,e);}}),a.maximize=((t,o)=>{if(a.statusBefore=a.status,e.onbeforemaximize&&e.onbeforemaximize.length>0&&!jsPanel.processCallbacks(a,e.onbeforemaximize,"some",a.statusBefore))return a;document.dispatchEvent(c);const n=a.parentElement,s=jsPanel.pOcontainment(e.maximizedMargin);return n===document.body?(a.style.width=document.documentElement.clientWidth-s[1]-s[3]+"px",a.style.height=document.documentElement.clientHeight-s[0]-s[2]+"px",a.style.left=s[3]+"px",a.style.top=s[0]+"px"):(a.style.width=n.clientWidth-s[1]-s[3]+"px",a.style.height=n.clientHeight-s[0]-s[2]+"px",a.style.left=s[3]+"px",a.style.top=s[0]+"px"),C.style.transform="unset",a.removeMinimizedReplacement(),a.status="maximized",a.setControls([".jsPanel-btn-maximize"]),o||a.front(),document.dispatchEvent(d),document.dispatchEvent(r),e.onstatuschange&&jsPanel.processCallbacks(a,e.onstatuschange,"every",a.statusBefore),t&&t.call(a,a,a.statusBefore),e.onmaximized&&jsPanel.processCallbacks(a,e.onmaximized,"every",a.statusBefore),a}),a.minimize=(t=>{if("minimized"===a.status)return a;if(a.statusBefore=a.status,e.onbeforeminimize&&e.onbeforeminimize.length>0&&!jsPanel.processCallbacks(a,e.onbeforeminimize,"some",a.statusBefore))return a;if(document.dispatchEvent(p),!document.getElementById("jsPanel-replacement-container")){const e=document.createElement("div");e.id="jsPanel-replacement-container",document.body.append(e);}if(a.style.left="-9999px",a.status="minimized",document.dispatchEvent(h),document.dispatchEvent(r),e.onstatuschange&&jsPanel.processCallbacks(a,e.onstatuschange,"every",a.statusBefore),e.minimizeTo){let t,o,n,s=a.createMinimizedReplacement();switch(e.minimizeTo){case"default":document.getElementById("jsPanel-replacement-container").append(s);break;case"parentpanel":(t=(n=(o=a.closest(".jsPanel-content").parentElement).querySelectorAll(".jsPanel-minimized-box"))[n.length-1]).append(s);break;case"parent":(t=(o=a.parentElement).querySelector(".jsPanel-minimized-container"))||((t=document.createElement("div")).className="jsPanel-minimized-container",o.append(t)),t.append(s);break;default:document.querySelector(e.minimizeTo).append(s);}}return t&&t.call(a,a,a.statusBefore),e.onminimized&&jsPanel.processCallbacks(a,e.onminimized,"every",a.statusBefore),a}),a.normalize=(t=>"normalized"===a.status?a:(a.statusBefore=a.status,e.onbeforenormalize&&e.onbeforenormalize.length>0&&!jsPanel.processCallbacks(a,e.onbeforenormalize,"some",a.statusBefore)?a:(document.dispatchEvent(l),a.style.width=a.currentData.width,a.style.height=a.currentData.height,a.snapped?a.snap(a.snapped,!0):(a.style.left=a.currentData.left,a.style.top=a.currentData.top),C.style.transform="unset",a.removeMinimizedReplacement(),a.status="normalized",a.setControls([".jsPanel-btn-normalize"]),a.front(),document.dispatchEvent(i),document.dispatchEvent(r),e.onstatuschange&&jsPanel.processCallbacks(a,e.onstatuschange,"every",a.statusBefore),t&&t.call(a,a,a.statusBefore),e.onnormalized&&jsPanel.processCallbacks(a,e.onnormalized,"every",a.statusBefore),a))),a.smallify=(t=>{if("smallified"===a.status||"smallifiedmax"===a.status)return a;if(a.statusBefore=a.status,e.onbeforesmallify&&e.onbeforesmallify.length>0&&!jsPanel.processCallbacks(a,e.onbeforesmallify,"some",a.statusBefore))return a;document.dispatchEvent(f),a.style.overflow="hidden";const o=window.getComputedStyle(a),n=parseFloat(window.getComputedStyle(a.headerbar).height);a.style.height=parseFloat(o.borderTopWidth)+parseFloat(o.borderBottomWidth)+n+"px",C.style.transform="rotate(180deg)","normalized"===a.status?(a.setControls([".jsPanel-btn-normalize"]),a.status="smallified",document.dispatchEvent(u),document.dispatchEvent(r),e.onstatuschange&&jsPanel.processCallbacks(a,e.onstatuschange,"every",a.statusBefore)):"maximized"===a.status&&(a.setControls([".jsPanel-btn-maximize"]),a.status="smallifiedmax",document.dispatchEvent(m),document.dispatchEvent(r),e.onstatuschange&&jsPanel.processCallbacks(a,e.onstatuschange,"every",a.statusBefore));const s=a.querySelectorAll(".jsPanel-minimized-box");return s[s.length-1].style.display="none",t&&t.call(a,a,a.statusBefore),e.onsmallified&&jsPanel.processCallbacks(a,e.onsmallified,"every",a.statusBefore),a}),a.unsmallify=(t=>{if(a.statusBefore=a.status,"smallified"===a.status||"smallifiedmax"===a.status){if(e.onbeforeunsmallify&&e.onbeforeunsmallify.length>0&&!jsPanel.processCallbacks(a,e.onbeforeunsmallify,"some",a.statusBefore))return a;document.dispatchEvent(g),a.style.overflow="visible",a.front(),"smallified"===a.status?(a.style.height=a.currentData.height,a.setControls([".jsPanel-btn-normalize"]),a.status="normalized",document.dispatchEvent(i),document.dispatchEvent(r),e.onstatuschange&&jsPanel.processCallbacks(a,e.onstatuschange,"every",a.statusBefore)):"smallifiedmax"===a.status?a.maximize():"minimized"===a.status&&a.normalize(),C.style.transform="rotate(0deg)";const o=a.querySelectorAll(".jsPanel-minimized-box");o[o.length-1].style.display="flex",t&&t.call(a,a,a.statusBefore),e.onunsmallified&&jsPanel.processCallbacks(a,e.onunsmallified,"every",a.statusBefore);}return a}),a.front=((t,o=!0)=>{if("minimized"===a.status)"maximized"===a.statusBefore?a.maximize():a.normalize();else {const e=Array.prototype.slice.call(document.querySelectorAll(".jsPanel-standard")).map(e=>e.style.zIndex);Math.max(...e)>a.style.zIndex&&(a.style.zIndex=jsPanel.zi.next()),jsPanel.resetZi();}return document.dispatchEvent(b),t&&t.call(a,a),e.onfronted&&o&&jsPanel.processCallbacks(a,e.onfronted,"every",a.status),a}),a.snap=((e,t=!1)=>{if(t||(a.currentData.beforeSnap={width:a.currentData.width,height:a.currentData.height}),e&&"function"==typeof e&&!t)e.call(a,a,a.snappableTo);else if(!1!==e){let e=[0,0];if(a.options.dragit.snap.containment&&a.options.dragit.containment){const t=jsPanel.pOcontainment(a.options.dragit.containment),o=a.snappableTo;o.startsWith("left")?e[0]=t[3]:o.startsWith("right")&&(e[0]=-t[1]),o.endsWith("top")?e[1]=t[0]:o.endsWith("bottom")&&(e[1]=-t[2]);}a.reposition(`${a.snappableTo} ${e[0]} ${e[1]}`);}t||(a.snapped=a.snappableTo);}),a.move=((e,t)=>{let o=a.overlaps(e,"paddingbox"),n=a.parentElement;return e.appendChild(a),a.options.container=e,a.style.left=o.left+"px",a.style.top=o.top+"px",a.saveCurrentDimensions(),a.saveCurrentPosition(),a.calcSizeFactors(),t&&t.call(a,a,e,n),a}),a.closeChildpanels=(e=>(a.getChildpanels().forEach(e=>e.close()),e&&e.call(a,a),a)),a.getChildpanels=(e=>{const t=a.content.querySelectorAll(".jsPanel");return e&&t.forEach((t,o,n)=>{e.call(t,t,o,n);}),t}),a.isChildpanel=(e=>{const t=a.closest(".jsPanel-content"),o=t?t.parentElement:null;return e&&e.call(a,a,o),!!t&&o}),a.contentRemove=(e=>(jsPanel.emptyNode(a.content),e&&e.call(a,a),a)),a.createMinimizedReplacement=(()=>{const t=jsPanel.createMinimizedTemplate(),o=window.getComputedStyle(a.headertitle).color,n=window.getComputedStyle(a),s=e.iconfont,r=t.querySelector(".jsPanel-controlbar");return "auto-show-hide"!==a.options.header?jsPanel.setStyles(t,{backgroundColor:n.backgroundColor,backgroundPositionX:n.backgroundPositionX,backgroundPositionY:n.backgroundPositionY,backgroundRepeat:n.backgroundRepeat,backgroundAttachment:n.backgroundAttachment,backgroundImage:n.backgroundImage,backgroundSize:n.backgroundSize,backgroundOrigin:n.backgroundOrigin,backgroundClip:n.backgroundClip}):t.style.backgroundColor=window.getComputedStyle(a.header).backgroundColor,t.id=a.id+"-min",t.querySelector(".jsPanel-headerbar").replaceChild(a.headerlogo.cloneNode(!0),t.querySelector(".jsPanel-headerlogo")),t.querySelector(".jsPanel-titlebar").replaceChild(a.headertitle.cloneNode(!0),t.querySelector(".jsPanel-title")),t.querySelector(".jsPanel-titlebar").setAttribute("title",a.headertitle.textContent),t.querySelector(".jsPanel-title").style.color=o,r.style.color=o,r.querySelectorAll("button").forEach(e=>e.style.color=o),["jsPanel-hdr-dark","jsPanel-hdr-light"].forEach(e=>{a.header.classList.contains(e)&&t.querySelector(".jsPanel-hdr").classList.add(e);}),a.setIconfont(s,t),"enabled"===a.dataset.btnnormalize?jsPanel.pointerup.forEach(e=>{t.querySelector(".jsPanel-btn-normalize").addEventListener(e,e=>{if(e.preventDefault(),e.button&&e.button>0)return !1;a.normalize();});}):r.querySelector(".jsPanel-btn-normalize").style.display="none","enabled"===a.dataset.btnmaximize?jsPanel.pointerup.forEach(e=>{t.querySelector(".jsPanel-btn-maximize").addEventListener(e,e=>{if(e.preventDefault(),e.button&&e.button>0)return !1;a.maximize();});}):r.querySelector(".jsPanel-btn-maximize").style.display="none","enabled"===a.dataset.btnclose?jsPanel.pointerup.forEach(e=>{t.querySelector(".jsPanel-btn-close").addEventListener(e,e=>{if(e.preventDefault(),e.button&&e.button>0)return !1;a.close(null,!0);});}):r.querySelector(".jsPanel-btn-close").style.display="none",t}),a.removeMinimizedReplacement=(()=>{const e=document.getElementById(`${a.id}-min`);e&&e.parentElement.removeChild(e);}),a.drag=((e={})=>{let t,o,n;const s=new CustomEvent("jspaneldragstart",{detail:a.id}),r=new CustomEvent("jspaneldrag",{detail:a.id}),l=new CustomEvent("jspaneldragstop",{detail:a.id});[s,r,l].forEach(e=>e.panel=a);const i=e=>{let t=e.split("-");return t.forEach((e,o)=>{t[o]=e.charAt(0).toUpperCase()+e.slice(1);}),"snap"+t.join("")};function c(e){null===e.relatedTarget&&jsPanel.pointermove.forEach(e=>{document.removeEventListener(e,o,!1),a.style.opacity=1;});}let d=e.handles||jsPanel.defaults.dragit.handles,p=e.cursor||jsPanel.defaults.dragit.cursor;function h(e){if(jsPanel.pointermove.forEach(e=>document.removeEventListener(e,o)),jsPanel.removeSnapAreas(),t){if(a.style.opacity=1,t=void 0,n.snap){switch(a.snappableTo){case"left-top":a.snap(n.snap.snapLeftTop);break;case"center-top":a.snap(n.snap.snapCenterTop);break;case"right-top":a.snap(n.snap.snapRightTop);break;case"right-center":a.snap(n.snap.snapRightCenter);break;case"right-bottom":a.snap(n.snap.snapRightBottom);break;case"center-bottom":a.snap(n.snap.snapCenterBottom);break;case"left-bottom":a.snap(n.snap.snapLeftBottom);break;case"left-center":a.snap(n.snap.snapLeftCenter);}n.snap.callback&&a.snappableTo&&"function"==typeof n.snap.callback&&(n.snap.callback.call(a,a),n.snap.repositionOnSnap&&!1!==n.snap[i(a.snappableTo)]&&a.repositionOnSnap(a.snappableTo)),a.snappableTo&&n.snap.repositionOnSnap&&n.snap[i(a.snappableTo)]&&a.repositionOnSnap(a.snappableTo);}if(a.droppableTo&&a.droppableTo){let e=a.parentElement;a.move(a.droppableTo),n.drop.callback&&n.drop.callback.call(a,a,a.droppableTo,e);}if(document.dispatchEvent(l),n.stop.length){let t=window.getComputedStyle(a),o={left:parseFloat(t.left),top:parseFloat(t.top),width:parseFloat(t.width),height:parseFloat(t.height)};jsPanel.processCallbacks(a,n.stop,!1,o,e);}a.saveCurrentPosition(),a.calcSizeFactors();}a.controlbar.style.pointerEvents="inherit",a.content.style.pointerEvents="inherit",document.querySelectorAll("iframe").forEach(e=>e.style.pointerEvents="auto"),document.removeEventListener(e,h);}return a.querySelectorAll(d).forEach(l=>{l.style.touchAction="none",l.style.cursor=p,jsPanel.pointerdown.forEach(i=>{l.addEventListener(i,l=>{if(l.button&&l.button>0)return !1;if((n=Object.assign({},jsPanel.defaults.dragit,e)).disableOnMaximized&&"maximized"===a.status)return !1;if((n.containment||0===n.containment)&&(n.containment=jsPanel.pOcontainment(n.containment)),n.grid&&Array.isArray(n.grid)&&1===n.grid.length&&(n.grid[1]=n.grid[0]),n.snap&&("object"==typeof n.snap?n.snap=Object.assign({},jsPanel.defaultSnapConfig,n.snap):n.snap=jsPanel.defaultSnapConfig),l.target.closest(".jsPanel-ftr-btn"))return;a.controlbar.style.pointerEvents="none",a.content.style.pointerEvents="none",document.querySelectorAll("iframe").forEach(e=>e.style.pointerEvents="none");let i=window.getComputedStyle(a),d=parseFloat(i.left),p=parseFloat(i.top),h=parseFloat(i.width),f=parseFloat(i.height),u=l.touches?l.touches[0].clientX:l.clientX,m=l.touches?l.touches[0].clientY:l.clientY,g=a.parentElement,b=g.getBoundingClientRect(),y=window.getComputedStyle(g),w=a.getScaleFactor(),v=0,j=jsPanel.getScrollbarWidth(g);o=(e=>{if(e.preventDefault(),!t){if(document.dispatchEvent(s),a.style.opacity=n.opacity,a.snapped&&n.snap.resizeToPreSnap&&a.currentData.beforeSnap){a.resize(a.currentData.beforeSnap.width+" "+a.currentData.beforeSnap.height),a.setControls([".jsPanel-btn-normalize"]);let e=a.getBoundingClientRect(),t=u-(e.left+e.width),o=e.width/2;t>-o&&(v=t+o);}if(a.front(),a.snapped=!1,"maximized"===a.status&&(a.setControls([".jsPanel-btn-normalize"]),a.status="normalized"),n.drop&&n.drop.dropZones){let e=n.drop.dropZones.map(e=>jsPanel.pOcontainer(e)),t=[];e.forEach(function(e){e.length?e.forEach(function(e){t.push(e);}):t.push(e);}),t=t.filter(function(e,t,o){return o.indexOf(e)===t}),n.drop.dropZones=t;}n.start.length&&jsPanel.processCallbacks(a,n.start,!1,{left:d,top:p,width:h,height:f},e);}let o,l,i,c,x,E,C,P,F,z;t=1;let S,A=e.touches?e.touches[0].clientX:e.clientX,k=e.touches?e.touches[0].clientY:e.clientY,B=window.getComputedStyle(a);if(g===document.body){let e=a.getBoundingClientRect();F=window.innerWidth-parseInt(y.borderLeftWidth,10)-parseInt(y.borderRightWidth,10)-(e.left+e.width),z=window.innerHeight-parseInt(y.borderTopWidth,10)-parseInt(y.borderBottomWidth,10)-(e.top+e.height);}else F=parseInt(y.width,10)-parseInt(y.borderLeftWidth,10)-parseInt(y.borderRightWidth,10)-(parseInt(B.left,10)+parseInt(B.width,10)),z=parseInt(y.height,10)-parseInt(y.borderTopWidth,10)-parseInt(y.borderBottomWidth,10)-(parseInt(B.top,10)+parseInt(B.height,10));o=parseFloat(B.left),i=parseFloat(B.top),x=F,C=z,n.snap&&("panel"===n.snap.trigger?(l=o**2,c=i**2,E=x**2,P=C**2):"pointer"===n.snap.trigger&&("window"===a.options.container?(o=A,l=A**2,c=(i=k)**2,E=(x=window.innerWidth-A)**2,P=(C=window.innerHeight-k)**2):(o=(S=a.overlaps(g,"paddingbox",e)).pointer.left,i=S.pointer.top,x=S.pointer.right,C=S.pointer.bottom,l=S.pointer.left**2,c=S.pointer.top**2,E=S.pointer.right**2,P=S.pointer.bottom**2)));let T=Math.sqrt(l+c),L=Math.sqrt(l+P),R=Math.sqrt(E+c),W=Math.sqrt(E+P),D=Math.abs(o-x)/2,$=Math.abs(i-C)/2,O=Math.sqrt(l+$**2),q=Math.sqrt(c+D**2),H=Math.sqrt(E+$**2),M=Math.sqrt(P+D**2);if(window.getSelection().removeAllRanges(),document.dispatchEvent(r),n.axis&&"x"!==n.axis||(a.style.left=d+(A-u)/w.x+v+"px"),n.axis&&"y"!==n.axis||(a.style.top=p+(k-m)/w.y+"px"),n.grid){let e=n.grid,t=n.axis,o=e[0]*Math.round((d+(A-u))/e[0]),s=e[1]*Math.round((p+(k-m))/e[1]);t&&"x"!==t||(a.style.left=`${o}px`),t&&"y"!==t||(a.style.top=`${s}px`);}if(n.containment||0===n.containment){let e,t,o=n.containment;if("window"===a.options.container)e=window.innerWidth-parseFloat(B.width)-o[1]-j.y,t=window.innerHeight-parseFloat(B.height)-o[2]-j.x;else {let n=parseFloat(y.borderLeftWidth)+parseFloat(y.borderRightWidth),a=parseFloat(y.borderTopWidth)+parseFloat(y.borderBottomWidth);e=b.width/w.x-parseFloat(B.width)-o[1]-n-j.y,t=b.height/w.y-parseFloat(B.height)-o[2]-a-j.x;}parseFloat(a.style.left)<=o[3]&&(a.style.left=o[3]+"px"),parseFloat(a.style.top)<=o[0]&&(a.style.top=o[0]+"px"),parseFloat(a.style.left)>=e&&(a.style.left=e+"px"),parseFloat(a.style.top)>=t&&(a.style.top=t+"px");}if(n.drag.length){let t={left:o,top:i,right:x,bottom:C,width:parseFloat(B.width),height:parseFloat(B.height)};jsPanel.processCallbacks(a,n.drag,!1,t,e);}if(n.snap){let e=n.snap.sensitivity,t=g===document.body?window.innerWidth/8:b.width/8,s=g===document.body?window.innerHeight/8:b.height/8;a.snappableTo=!1,jsPanel.removeSnapAreas(),T<e?!1!==n.snap.snapLeftTop&&(n.snap.active&&"both"!==n.snap.active?"pointer"===n.snap.trigger&&n.snap.active&&"inside"===n.snap.active&&(S.pointer.left>0&&S.pointer.top>0?(a.snappableTo="left-top",jsPanel.createSnapArea(a,"lt",e)):(a.snappableTo=!1,jsPanel.removeSnapAreas())):(a.snappableTo="left-top",jsPanel.createSnapArea(a,"lt",e))):L<e?!1!==n.snap.snapLeftBottom&&(n.snap.active&&"both"!==n.snap.active?"pointer"===n.snap.trigger&&n.snap.active&&"inside"===n.snap.active&&(S.pointer.left>0&&S.pointer.bottom>0?(a.snappableTo="left-bottom",jsPanel.createSnapArea(a,"lb",e)):(a.snappableTo=!1,jsPanel.removeSnapAreas())):(a.snappableTo="left-bottom",jsPanel.createSnapArea(a,"lb",e))):R<e?!1!==n.snap.snapRightTop&&(n.snap.active&&"both"!==n.snap.active?"pointer"===n.snap.trigger&&n.snap.active&&"inside"===n.snap.active&&(S.pointer.right>0&&S.pointer.top>0?(a.snappableTo="right-top",jsPanel.createSnapArea(a,"rt",e)):(a.snappableTo=!1,jsPanel.removeSnapAreas())):(a.snappableTo="right-top",jsPanel.createSnapArea(a,"rt",e))):W<e?!1!==n.snap.snapRightBottom&&(n.snap.active&&"both"!==n.snap.active?"pointer"===n.snap.trigger&&n.snap.active&&"inside"===n.snap.active&&(S.pointer.right>0&&S.pointer.bottom>0?(a.snappableTo="right-bottom",jsPanel.createSnapArea(a,"rb",e)):(a.snappableTo=!1,jsPanel.removeSnapAreas())):(a.snappableTo="right-bottom",jsPanel.createSnapArea(a,"rb",e))):i<e&&q<t?!1!==n.snap.snapCenterTop&&(n.snap.active&&"both"!==n.snap.active?"pointer"===n.snap.trigger&&n.snap.active&&"inside"===n.snap.active&&(S.pointer.top>0?(a.snappableTo="center-top",jsPanel.createSnapArea(a,"ct",e)):(a.snappableTo=!1,jsPanel.removeSnapAreas())):(a.snappableTo="center-top",jsPanel.createSnapArea(a,"ct",e))):o<e&&O<s?!1!==n.snap.snapLeftCenter&&(n.snap.active&&"both"!==n.snap.active?"pointer"===n.snap.trigger&&n.snap.active&&"inside"===n.snap.active&&(S.pointer.left>0?(a.snappableTo="left-center",jsPanel.createSnapArea(a,"lc",e)):(a.snappableTo=!1,jsPanel.removeSnapAreas())):(a.snappableTo="left-center",jsPanel.createSnapArea(a,"lc",e))):x<e&&H<s?!1!==n.snap.snapRightCenter&&(n.snap.active&&"both"!==n.snap.active?"pointer"===n.snap.trigger&&n.snap.active&&"inside"===n.snap.active&&(S.pointer.right>0?(a.snappableTo="right-center",jsPanel.createSnapArea(a,"rc",e)):(a.snappableTo=!1,jsPanel.removeSnapAreas())):(a.snappableTo="right-center",jsPanel.createSnapArea(a,"rc",e))):C<e&&M<t&&!1!==n.snap.snapCenterBottom&&(n.snap.active&&"both"!==n.snap.active?"pointer"===n.snap.trigger&&n.snap.active&&"inside"===n.snap.active&&(S.pointer.bottom>0?(a.snappableTo="center-bottom",jsPanel.createSnapArea(a,"cb",e)):(a.snappableTo=!1,jsPanel.removeSnapAreas())):(a.snappableTo="center-bottom",jsPanel.createSnapArea(a,"cb",e)));}if(n.drop&&n.drop.dropZones){let t=jsPanel.isIE?"msElementsFromPoint":"elementsFromPoint",o=document[t](e.clientX,e.clientY);Array.isArray(o)||(o=Array.prototype.slice.call(o)),n.drop.dropZones.forEach(e=>{o.includes(e)&&(a.droppableTo=e);}),o.includes(a.droppableTo)||(a.droppableTo=!1);}}),jsPanel.pointermove.forEach(e=>document.addEventListener(e,o)),window.addEventListener("mouseout",c,!1);});}),jsPanel.pointerup.forEach(e=>{document.addEventListener(e,h),window.removeEventListener("mouseout",c);}),e.disable&&(l.style.pointerEvents="none");}),a}),a.dragit=(t=>{const o=Object.assign({},jsPanel.defaults.dragit,e.dragit),n=a.querySelectorAll(o.handles);return "disable"===t?n.forEach(e=>e.style.pointerEvents="none"):n.forEach(e=>e.style.pointerEvents="auto"),a}),a.sizeit=((e={})=>{const t=new CustomEvent("jspanelresizestart",{detail:a.id}),o=new CustomEvent("jspanelresize",{detail:a.id}),n=new CustomEvent("jspanelresizestop",{detail:a.id});[t,o,n].forEach(e=>e.panel=a);let s,r,l,i,c,d,p={};p.handles=e.handles||jsPanel.defaults.resizeit.handles,p.handles.split(",").forEach(e=>{const t=document.createElement("DIV");t.className=`jsPanel-resizeit-handle jsPanel-resizeit-${e.trim()}`,a.append(t);});let h=!!e.aspectRatio&&e.aspectRatio;function f(e){null===e.relatedTarget&&jsPanel.pointermove.forEach(e=>document.removeEventListener(e,s,!1));}function u(e){if(jsPanel.pointermove.forEach(e=>document.removeEventListener(e,s,!1)),e.target.classList&&e.target.classList.contains("jsPanel-resizeit-handle")){let t,o,n=e.target.className;if(n.match(/jsPanel-resizeit-nw|jsPanel-resizeit-w|jsPanel-resizeit-sw/i)&&(t=!0),n.match(/jsPanel-resizeit-nw|jsPanel-resizeit-n|jsPanel-resizeit-ne/i)&&(o=!0),p.grid&&Array.isArray(p.grid)){1===p.grid.length&&(p.grid[1]=p.grid[0]);const e=parseFloat(a.style.width),n=parseFloat(a.style.height),s=e%p.grid[0],r=n%p.grid[1],l=parseFloat(a.style.left),i=parseFloat(a.style.top),c=l%p.grid[0],d=i%p.grid[1];s<p.grid[0]/2?a.style.width=e-s+"px":a.style.width=e+(p.grid[0]-s)+"px",r<p.grid[1]/2?a.style.height=n-r+"px":a.style.height=n+(p.grid[1]-r)+"px",t&&(c<p.grid[0]/2?a.style.left=l-c+"px":a.style.left=l+(p.grid[0]-c)+"px"),o&&(d<p.grid[1]/2?a.style.top=i-d+"px":a.style.top=i+(p.grid[1]-d)+"px");}}if(r){a.content.style.pointerEvents="inherit",r=void 0,a.saveCurrentDimensions(),a.saveCurrentPosition(),a.calcSizeFactors();let t=a.controlbar.querySelector(".jsPanel-btn-smallify"),o=a.getBoundingClientRect();if(t&&o.height>d+5&&(t.style.transform="rotate(0deg)"),document.dispatchEvent(n),p.stop.length){let t=window.getComputedStyle(a),o={left:parseFloat(t.left),top:parseFloat(t.top),width:parseFloat(t.width),height:parseFloat(t.height)};jsPanel.processCallbacks(a,p.stop,!1,o,e);}}a.content.style.pointerEvents="inherit",document.querySelectorAll("iframe").forEach(e=>e.style.pointerEvents="auto"),p.aspectRatio=h,document.removeEventListener(e,u);}return a.querySelectorAll(".jsPanel-resizeit-handle").forEach(n=>{n.style.touchAction="none",jsPanel.pointerdown.forEach(h=>{n.addEventListener(h,n=>{if(n.preventDefault(),n.stopPropagation(),n.button&&n.button>0)return !1;let h=1;if(((p=Object.assign({},jsPanel.defaults.resizeit,e)).containment||0===p.containment)&&(p.containment=jsPanel.pOcontainment(p.containment)),p.aspectRatio&&!0===p.aspectRatio&&(p.aspectRatio="panel"),jsPanel.modifier){let e=jsPanel.modifier;e.altKey?p.aspectRatio="content":e.ctrlKey?p.aspectRatio="panel":e.shiftKey&&(p.aspectRatio=!1,h=2);}let u="function"==typeof p.maxWidth?p.maxWidth():p.maxWidth||1e4,m="function"==typeof p.maxHeight?p.maxHeight():p.maxHeight||1e4,g="function"==typeof p.minWidth?p.minWidth():p.minWidth,b="function"==typeof p.minHeight?p.minHeight():p.minHeight;a.content.style.pointerEvents="none",document.querySelectorAll("iframe").forEach(e=>e.style.pointerEvents="none");const y=a.parentElement,w=y.tagName.toLowerCase(),v=a.getBoundingClientRect(),j=y.getBoundingClientRect(),x=window.getComputedStyle(y,null),E=parseInt(x.borderLeftWidth,10),C=parseInt(x.borderTopWidth,10),P=x.getPropertyValue("position"),F=n.clientX||0===n.clientX||n.touches[0].clientX,z=n.clientY||0===n.clientY||n.touches[0].clientY,S=F/z,A=n.target.classList,k=a.getScaleFactor(),B=v.width/v.height,T=a.content.getBoundingClientRect(),L=T.width/T.height,R=a.header.getBoundingClientRect().height,W=a.footer.getBoundingClientRect().height||0;let D=v.left,$=v.top,O=1e4,q=1e4,H=1e4,M=1e4;c=v.width,d=v.height,"body"!==w&&(D=v.left-j.left+y.scrollLeft,$=v.top-j.top+y.scrollTop),"body"===w&&p.containment?(O=document.documentElement.clientWidth-v.left,H=document.documentElement.clientHeight-v.top,q=v.width+v.left,M=v.height+v.top):p.containment&&("static"===P?(O=j.width-v.left+E,H=j.height+j.top-v.top+C,q=v.width+(v.left-j.left)-E,M=v.height+(v.top-j.top)-C):(O=y.clientWidth-(v.left-j.left)/k.x+E,H=y.clientHeight-(v.top-j.top)/k.y+C,q=(v.width+v.left-j.left)/k.x-E,M=a.clientHeight+(v.top-j.top)/k.y-C)),p.containment&&(q-=p.containment[3],M-=p.containment[0],O-=p.containment[1],H-=p.containment[2]);const N=window.getComputedStyle(a),I=parseFloat(N.width)-v.width,V=parseFloat(N.height)-v.height;let X=parseFloat(N.left)-v.left,Y=parseFloat(N.top)-v.top;y!==document.body&&(X+=j.left,Y+=j.top);let Z=parseInt(N.borderTopWidth,10),U=parseInt(N.borderRightWidth,10),K=parseInt(N.borderBottomWidth,10),_=parseInt(N.borderLeftWidth,10);s=(e=>{e.preventDefault(),r||(document.dispatchEvent(t),p.start.length&&jsPanel.processCallbacks(a,p.start,!1,{width:c,height:d,left:D,top:$},e),a.front(),"maximized"===a.status&&(a.status="normalized",a.controlbar.querySelector(".jsPanel-btn-maximize")&&a.setControlStatus("maximize","show"),a.controlbar.querySelector(".jsPanel-btn-normalize")&&a.setControlStatus("normalize","hide")),v.height>d+5&&(a.status="normalized",a.setControls([".jsPanel-btn-normalize"]))),r=1,document.dispatchEvent(o);let s=e.touches?e.touches[0].clientX:e.clientX,f=e.touches?e.touches[0].clientY:e.clientY;A.contains("jsPanel-resizeit-e")?((l=c+(s-F)*h/k.x+I)>=O&&(l=O),l>=u&&(l=u),l<=g&&(l=g),a.style.width=l+"px",2===h&&(a.style.left=D-(s-F)+"px"),"content"===p.aspectRatio?(a.style.height=(l-U-_)/L+R+W+Z+K+"px",p.containment&&(a.overlaps(y)).bottom<=p.containment[2]&&(a.style.height=H+"px",a.style.width=H*L+"px")):"panel"===p.aspectRatio&&(a.style.height=l/B+"px",p.containment&&(a.overlaps(y)).bottom<=p.containment[2]&&(a.style.height=H+"px",a.style.width=H*B+"px"))):A.contains("jsPanel-resizeit-s")?((i=d+(f-z)*h/k.y+V)>=H&&(i=H),i>=m&&(i=m),i<=b&&(i=b),a.style.height=i+"px",2===h&&(a.style.top=$-(f-z)+"px"),"content"===p.aspectRatio?(a.style.width=(i-R-W-Z-K)*L+Z+K+"px",p.containment&&(a.overlaps(y)).right<=p.containment[1]&&(a.style.width=O+"px",a.style.height=O/L+"px")):"panel"===p.aspectRatio&&(a.style.width=i*B+"px",p.containment&&(a.overlaps(y)).right<=p.containment[1]&&(a.style.width=O+"px",a.style.height=O/B+"px"))):A.contains("jsPanel-resizeit-w")?((l=c+(F-s)*h/k.x+I)<=u&&l>=g&&l<=q&&(a.style.left=D+(s-F)/k.x+X+"px"),l>=q&&(l=q),l>=u&&(l=u),l<=g&&(l=g),a.style.width=l+"px","content"===p.aspectRatio?(a.style.height=(l-U-_)/L+R+W+Z+K+"px",p.containment&&(a.overlaps(y)).bottom<=p.containment[2]&&(a.style.height=H+"px",a.style.width=H*L+"px")):"panel"===p.aspectRatio&&(a.style.height=l/B+"px",p.containment&&(a.overlaps(y)).bottom<=p.containment[2]&&(a.style.height=H+"px",a.style.width=H*B+"px"))):A.contains("jsPanel-resizeit-n")?((i=d+(z-f)*h/k.y+V)<=m&&i>=b&&i<=M&&(a.style.top=$+(f-z)/k.y+Y+"px"),i>=M&&(i=M),i>=m&&(i=m),i<=b&&(i=b),a.style.height=i+"px","content"===p.aspectRatio?(a.style.width=(i-R-W-Z-K)*L+Z+K+"px",p.containment&&(a.overlaps(y)).right<=p.containment[1]&&(a.style.width=O+"px",a.style.height=O/L+"px")):"panel"===p.aspectRatio&&(a.style.width=i*B+"px",p.containment&&(a.overlaps(y)).right<=p.containment[1]&&(a.style.width=O+"px",a.style.height=O/B+"px"))):A.contains("jsPanel-resizeit-se")?((l=c+(s-F)*h/k.x+I)>=O&&(l=O),l>=u&&(l=u),l<=g&&(l=g),a.style.width=l+"px",2===h&&(a.style.left=D-(s-F)+"px"),p.aspectRatio&&(a.style.height=l/B+"px"),(i=d+(f-z)*h/k.y+V)>=H&&(i=H),i>=m&&(i=m),i<=b&&(i=b),a.style.height=i+"px",2===h&&(a.style.top=$-(f-z)+"px"),"content"===p.aspectRatio?(a.style.width=(i-R-W-Z-K)*L+Z+K+"px",p.containment&&(a.overlaps(y)).right<=p.containment[1]&&(a.style.width=O+"px",a.style.height=O/L+"px")):"panel"===p.aspectRatio&&(a.style.width=i*B+"px",p.containment&&(a.overlaps(y)).right<=p.containment[1]&&(a.style.width=O+"px",a.style.height=O/B+"px"))):A.contains("jsPanel-resizeit-sw")?((i=d+(f-z)*h/k.y+V)>=H&&(i=H),i>=m&&(i=m),i<=b&&(i=b),a.style.height=i+"px",2===h&&(a.style.top=$-(f-z)+"px"),p.aspectRatio&&(a.style.width=i*B+"px"),(l=c+(F-s)*h/k.x+I)<=u&&l>=g&&l<=q&&(a.style.left=D+(s-F)/k.x+X+"px"),l>=q&&(l=q),l>=u&&(l=u),l<=g&&(l=g),a.style.width=l+"px","content"===p.aspectRatio?(a.style.height=(l-U-_)/L+R+W+Z+K+"px",p.containment&&(a.overlaps(y)).bottom<=p.containment[2]&&(a.style.height=H+"px",a.style.width=H*L+"px")):"panel"===p.aspectRatio&&(a.style.height=l/B+"px",p.containment&&(a.overlaps(y)).bottom<=p.containment[2]&&(a.style.height=H+"px",a.style.width=H*B+"px"))):A.contains("jsPanel-resizeit-ne")?((l=c+(s-F)*h/k.x+I)>=O&&(l=O),l>=u&&(l=u),l<=g&&(l=g),a.style.width=l+"px",2===h&&(a.style.left=D-(s-F)+"px"),p.aspectRatio&&(a.style.height=l/B+"px"),(i=d+(z-f)*h/k.y+V)<=m&&i>=b&&i<=M&&(a.style.top=$+(f-z)/k.y+Y+"px"),i>=M&&(i=M),i>=m&&(i=m),i<=b&&(i=b),a.style.height=i+"px","content"===p.aspectRatio?(a.style.width=(i-R-W-Z-K)*L+Z+K+"px",p.containment&&(a.overlaps(y)).right<=p.containment[1]&&(a.style.width=O+"px",a.style.height=O/L+"px")):"panel"===p.aspectRatio&&(a.style.width=i*B+"px",p.containment&&(a.overlaps(y)).right<=p.containment[1]&&(a.style.width=O+"px",a.style.height=O/B+"px"))):A.contains("jsPanel-resizeit-nw")&&(p.aspectRatio&&A.contains("jsPanel-resizeit-nw")&&(f=(s=f*S)/S),(l=c+(F-s)*h/k.x+I)<=u&&l>=g&&l<=q&&(a.style.left=D+(s-F)/k.x+X+"px"),l>=q&&(l=q),l>=u&&(l=u),l<=g&&(l=g),a.style.width=l+"px",p.aspectRatio&&(a.style.height=l/B+"px"),(i=d+(z-f)*h/k.y+V)<=m&&i>=b&&i<=M&&(a.style.top=$+(f-z)/k.y+Y+"px"),i>=M&&(i=M),i>=m&&(i=m),i<=b&&(i=b),a.style.height=i+"px","content"===p.aspectRatio?a.style.width=(i-R-W-Z-K)*L+Z+K+"px":"panel"===p.aspectRatio&&(a.style.width=i*B+"px")),window.getSelection().removeAllRanges();const w=window.getComputedStyle(a),j={left:parseFloat(w.left),top:parseFloat(w.top),right:parseFloat(w.right),bottom:parseFloat(w.bottom),width:parseFloat(w.width),height:parseFloat(w.height)};p.resize.length&&jsPanel.processCallbacks(a,p.resize,!1,j,e);}),jsPanel.pointermove.forEach(e=>document.addEventListener(e,s,!1)),window.addEventListener("mouseout",f,!1);});}),jsPanel.pointerup.forEach(function(e){document.addEventListener(e,u),window.removeEventListener("mouseout",f);}),e.disable&&(n.style.pointerEvents="none");}),a}),a.resizeit=(e=>{const t=a.querySelectorAll(".jsPanel-resizeit-handle");return "disable"===e?t.forEach(e=>e.style.pointerEvents="none"):t.forEach(e=>e.style.pointerEvents="auto"),a}),a.getScaleFactor=(()=>{const e=a.getBoundingClientRect();return {x:e.width/a.offsetWidth,y:e.height/a.offsetHeight}}),a.calcSizeFactors=(()=>{const t=window.getComputedStyle(a);if("window"===e.container)a.hf=parseFloat(t.left)/(window.innerWidth-parseFloat(t.width)),a.vf=parseFloat(t.top)/(window.innerHeight-parseFloat(t.height));else if(a.parentElement){let e=a.parentElement.getBoundingClientRect();a.hf=parseFloat(t.left)/(e.width-parseFloat(t.width)),a.vf=parseFloat(t.top)/(e.height-parseFloat(t.height));}}),a.saveCurrentDimensions=((e=!1)=>{const t=window.getComputedStyle(a);a.currentData.width=t.width,"normalized"===a.status&&(a.currentData.height=t.height),e&&(a.style.height=t.height);}),a.saveCurrentPosition=(()=>{const e=window.getComputedStyle(a);a.currentData.left=e.left,a.currentData.top=e.top;}),a.reposition=((...t)=>{let o,n=e.position,s=!0;return t.forEach(e=>{"string"==typeof e||"object"==typeof e?n=e:"boolean"==typeof e?s=e:"function"==typeof e&&(o=e);}),jsPanel.position(a,n),a.slaves&&a.slaves.size>0&&a.slaves.forEach(e=>e.reposition()),s&&a.saveCurrentPosition(),o&&o.call(a,a),a}),a.repositionOnSnap=(t=>{let o="0",n="0",s=jsPanel.pOcontainment(e.dragit.containment);if(e.dragit.snap.containment)switch(t){case"left-top":o=s[3],n=s[0];break;case"right-top":o=-s[1],n=s[0];break;case"right-bottom":o=-s[1],n=-s[2];break;case"left-bottom":o=s[3],n=-s[2];break;case"center-top":o=s[3]/2-s[1]/2,n=s[0];break;case"center-bottom":o=s[3]/2-s[1]/2,n=-s[2];break;case"left-center":o=s[3],n=s[0]/2-s[2]/2;break;case"right-center":o=-s[1],n=s[0]/2-s[2]/2;}jsPanel.position(a,t),jsPanel.setStyles(a,{left:`calc(${a.style.left} + ${o}px)`,top:`calc(${a.style.top} + ${n}px)`});}),a.overlaps=((e,t,o)=>{let n,s=a.getBoundingClientRect(),r=getComputedStyle(a.parentElement),l=a.getScaleFactor(),i={top:0,right:0,bottom:0,left:0},c=0,d=0,p=0,h=0;"window"!==a.options.container&&"paddingbox"===t&&(i.top=parseInt(r.borderTopWidth,10)*l.y,i.right=parseInt(r.borderRightWidth,10)*l.x,i.bottom=parseInt(r.borderBottomWidth,10)*l.y,i.left=parseInt(r.borderLeftWidth,10)*l.x),n="string"==typeof e?"window"===e?{left:0,top:0,right:window.innerWidth,bottom:window.innerHeight}:"parent"===e?a.parentElement.getBoundingClientRect():document.querySelector(e).getBoundingClientRect():e.getBoundingClientRect(),o&&(c=o.touches?o.touches[0].clientX:o.clientX,d=o.touches?o.touches[0].clientY:o.clientY,p=c-n.left,h=d-n.top);let f=s.left<n.right&&s.right>n.left,u=s.top<n.bottom&&s.bottom>n.top;return {overlaps:f&&u,top:s.top-n.top-i.top,right:n.right-s.right-i.right,bottom:n.bottom-s.bottom-i.bottom,left:s.left-n.left-i.left,parentBorderWidth:i,panelRect:s,referenceRect:n,pointer:{clientX:c,clientY:d,left:p-i.left,top:h-i.top,right:n.width-p-i.right,bottom:n.height-h-i.bottom}}}),a.setSize=(()=>{if(e.panelSize){const t=jsPanel.pOsize(a,e.panelSize);a.style.width=t.width,a.style.height=t.height;}else if(e.contentSize){const t=jsPanel.pOsize(a,e.contentSize);a.content.style.width=t.width,a.content.style.height=t.height,a.style.width=t.width,a.content.style.width="100%";}return a}),a.resize=((...e)=>{let t,o=window.getComputedStyle(a),n={width:o.width,height:o.height},s=!0;e.forEach(e=>{"string"==typeof e?n=e:"object"==typeof e?n=Object.assign(n,e):"boolean"==typeof e?s=e:"function"==typeof e&&(t=e);});let r=jsPanel.pOsize(a,n);a.style.width=r.width,a.style.height=r.height,a.slaves&&a.slaves.size>0&&a.slaves.forEach(e=>e.reposition()),s&&a.saveCurrentDimensions(),a.status="normalized";let l=a.controlbar.querySelector(".jsPanel-btn-smallify");return l&&(l.style.transform="rotate(0deg)"),t&&t.call(a,a),a.calcSizeFactors(),a}),a.windowResizeHandler=(t=>{if(t.target===window){let o,n,s=a.status,r=e.onwindowresize;if("maximized"===s&&r)a.maximize(!1,!0);else if(a.snapped&&"minimized"!==s)a.snap(a.snapped,!0);else if("normalized"===s||"smallified"===s||"maximized"===s){let e=typeof r;"boolean"===e?(o=(window.innerWidth-a.offsetWidth)*a.hf,a.style.left=o<=0?0:o+"px",n=(window.innerHeight-a.offsetHeight)*a.vf,a.style.top=n<=0?0:n+"px"):"function"===e?r.call(a,t,a):"object"===e&&(!0===r.preset?(o=(window.innerWidth-a.offsetWidth)*a.hf,a.style.left=o<=0?0:o+"px",n=(window.innerHeight-a.offsetHeight)*a.vf,a.style.top=n<=0?0:n+"px",r.callback.call(a,t,a)):r.callback.call(a,t,a));}else "smallifiedmax"===s&&r&&a.maximize(!1,!0).smallify();a.slaves&&a.slaves.size>0&&a.slaves.forEach(e=>e.reposition());}}),a.setControls=((e,t)=>(a.header.querySelectorAll(".jsPanel-btn").forEach(e=>{const t=e.className.split("-"),o=t[t.length-1];"hidden"!==a.getAttribute(`data-btn${o}`)&&(e.style.display="block");}),e.forEach(e=>{const t=a.controlbar.querySelector(e);t&&(t.style.display="none");}),t&&t.call(a,a),a)),a.setControlStatus=((e,t="enable",o)=>{const n=a.controlbar.querySelector(`.jsPanel-btn-${e}`);switch(t){case"disable":"removed"!==a.getAttribute(`data-btn${e}`)&&(a.setAttribute(`data-btn${e}`,"disabled"),n.style.pointerEvents="none",n.style.opacity=.4,n.style.cursor="default");break;case"hide":"removed"!==a.getAttribute(`data-btn${e}`)&&(a.setAttribute(`data-btn${e}`,"hidden"),n.style.display="none");break;case"show":"removed"!==a.getAttribute(`data-btn${e}`)&&(a.setAttribute(`data-btn${e}`,"enabled"),n.style.display="block",n.style.pointerEvents="auto",n.style.opacity=1,n.style.cursor="pointer");break;case"enable":"removed"!==a.getAttribute(`data-btn${e}`)&&("hidden"===a.getAttribute(`data-btn${e}`)&&(n.style.display="block"),a.setAttribute(`data-btn${e}`,"enabled"),n.style.pointerEvents="auto",n.style.opacity=1,n.style.cursor="pointer");break;case"remove":a.controlbar.removeChild(n),a.setAttribute(`data-btn${e}`,"removed");}return o&&o.call(a,a),a}),a.setControlSize=(e=>{const t=e.toLowerCase();a.controlbar.querySelectorAll(".jsPanel-btn").forEach(e=>{["jsPanel-btn-xl","jsPanel-btn-lg","jsPanel-btn-md","jsPanel-btn-sm","jsPanel-btn-xs"].forEach(t=>e.classList.remove(t)),e.classList.add(`jsPanel-btn-${t}`);}),"xl"===t?a.titlebar.style.fontSize="1.5rem":"lg"===t?a.titlebar.style.fontSize="1.25rem":"md"===t?a.titlebar.style.fontSize="1.05rem":"sm"===t?a.titlebar.style.fontSize=".9rem":"xs"===t&&(a.titlebar.style.fontSize=".8rem");}),a.setHeaderControls=(t=>{if(a.options.headerControls.add){let e=a.options.headerControls.add;Array.isArray(e)||(e=[e]),e.forEach(e=>a.addControl(e));}let o=[];a.controlbar.querySelectorAll(".jsPanel-btn").forEach(e=>{let t=e.className.match(/jsPanel-btn-[a-z0-9]{3,}/i)[0].substring(12);o.push(t);});const n=jsPanel.pOheaderControls(e.headerControls);return e.headerControls=n,o.forEach(e=>{n[e]&&a.setControlStatus(e,n[e]);}),a.setControlSize(n.size),t&&t.call(a,a),a}),a.setHeaderLogo=((e,t)=>{let o=[a.headerlogo],n=document.querySelector("#"+a.id+"-min");return n&&o.push(n.querySelector(".jsPanel-headerlogo")),"string"==typeof e?e.startsWith("<")?o.forEach(t=>t.innerHTML=e):o.forEach(t=>{jsPanel.emptyNode(t);let o=document.createElement("img");o.src=e,t.append(o);}):o.forEach(t=>{jsPanel.emptyNode(t),t.append(e);}),a.headerlogo.childNodes.forEach(e=>{e.nodeName&&"IMG"===e.nodeName&&e.setAttribute("draggable","false");}),t&&t.call(a,a),a}),a.setHeaderRemove=(e=>(a.removeChild(a.header),a.content.classList.add("jsPanel-content-noheader"),["close","maximize","normalize","minimize","smallify"].forEach(e=>a.setAttribute(`data-btn${e}`,"removed")),e&&e.call(a,a),a)),a.setHeaderTitle=((e,t)=>{let o=[a.headertitle],n=document.querySelector("#"+a.id+"-min");return n&&o.push(n.querySelector(".jsPanel-title")),"string"==typeof e?o.forEach(t=>t.innerHTML=e):"function"==typeof e?o.forEach(t=>{jsPanel.emptyNode(t),t.innerHTML=e();}):o.forEach(t=>{jsPanel.emptyNode(t),t.append(e);}),t&&t.call(a,a),a}),a.setIconfont=((e,t=a,o)=>{if(e){let o,n;if("fa"===e||"far"===e||"fal"===e||"fas"===e||"fad"===e)o=[`${e} fa-window-close`,`${e} fa-window-maximize`,`${e} fa-window-restore`,`${e} fa-window-minimize`,`${e} fa-chevron-up`];else if("material-icons"===e)o=[e,e,e,e,e,e],n=["close","fullscreen","fullscreen_exit","call_received","expand_less"];else if(Array.isArray(e))o=[`custom-control-icon ${e[4]}`,`custom-control-icon ${e[3]}`,`custom-control-icon ${e[2]}`,`custom-control-icon ${e[1]}`,`custom-control-icon ${e[0]}`];else {if("bootstrap"!==e&&"glyphicon"!==e)return t;o=["glyphicon glyphicon-remove","glyphicon glyphicon-fullscreen","glyphicon glyphicon-resize-full","glyphicon glyphicon-minus","glyphicon glyphicon-chevron-up"];}t.querySelectorAll(".jsPanel-controlbar .jsPanel-btn").forEach(e=>jsPanel.emptyNode(e).innerHTML="<span></span>"),Array.prototype.slice.call(t.querySelectorAll(".jsPanel-controlbar .jsPanel-btn > span")).reverse().forEach((t,a)=>{t.className=o[a],"material-icons"===e&&(t.textContent=n[a]);});}return o&&o.call(t,t),t}),a.addToolbar=((e,t,o)=>{if("header"===e?e=a.headertoolbar:"footer"===e&&(e=a.footer),"string"==typeof t)e.innerHTML=t;else if(Array.isArray(t))t.forEach(t=>{"string"==typeof t?e.innerHTML+=t:e.append(t);});else if("function"==typeof t){let o=t.call(a,a);"string"==typeof o?e.innerHTML=o:e.append(o);}else e.append(t);return e.classList.add("active"),o&&o.call(a,a),a}),a.addCloseControl=(()=>{let e=document.createElement("button"),t=a.content.style.color;return e.classList.add("jsPanel-addCloseCtrl"),e.innerHTML=jsPanel.icons.close,e.style.color=t,a.options.rtl&&e.classList.add("rtl"),a.appendChild(e),jsPanel.pointerup.forEach(t=>{e.addEventListener(t,e=>{if(e.preventDefault(),e.button&&e.button>0)return !1;a.close(null,!0);});}),jsPanel.pointerdown.forEach(t=>{e.addEventListener(t,e=>e.preventDefault());}),a}),a.addControl=(t=>{if(!t.html)return a;t.position||(t.position=1);const o=a.controlbar.querySelectorAll(".jsPanel-btn").length;let n=document.createElement("button");n.innerHTML=t.html,n.className=`jsPanel-btn jsPanel-btn-${t.name} jsPanel-btn-${e.headerControls.size}`,n.style.color=a.header.style.color,t.position>o?a.controlbar.append(n):a.controlbar.insertBefore(n,a.querySelector(`.jsPanel-controlbar .jsPanel-btn:nth-child(${t.position})`));const s=t.ariaLabel||t.name;return s&&n.setAttribute("aria-label",s),jsPanel.pointerup.forEach(e=>{n.addEventListener(e,e=>{if(e.preventDefault(),e.button&&e.button>0)return !1;t.handler.call(a,a,n);});}),t.afterInsert&&t.afterInsert.call(n,n),a}),a.setRtl=(()=>{[a.header,a.content,a.footer].forEach(t=>{t.dir="rtl",e.rtl.lang&&(t.lang=e.rtl.lang);});}),a.id=e.id,a.classList.add("jsPanel-"+e.paneltype),"standard"===e.paneltype&&(a.style.zIndex=this.zi.next()),n.append(a),a.front(!1,!1),a.setTheme(e.theme),e.boxShadow&&a.classList.add(`jsPanel-depth-${e.boxShadow}`),e.header){if(e.headerLogo&&a.setHeaderLogo(e.headerLogo),a.setIconfont(e.iconfont),a.setHeaderTitle(e.headerTitle),a.setHeaderControls(),jsPanel.isIE){let e=[a.headerbar,a.controlbar];switch(a.options.headerControls.size){case"md":e.forEach(e=>{e.style.height="34px";});break;case"xs":e.forEach(e=>{e.style.height="26px";});break;case"sm":e.forEach(e=>{e.style.height="30px";});break;case"lg":e.forEach(e=>{e.style.height="38px";});break;case"xl":e.forEach(e=>{e.style.height="42px";});}}if("auto-show-hide"===e.header){let t="jsPanel-depth-"+e.boxShadow;a.header.style.opacity=0,a.style.backgroundColor="transparent",this.remClass(a,t),this.setClass(a.content,t),a.header.addEventListener("mouseenter",()=>{a.header.style.opacity=1,jsPanel.setClass(a,t),jsPanel.remClass(a.content,t);}),a.header.addEventListener("mouseleave",()=>{a.header.style.opacity=0,jsPanel.remClass(a,t),jsPanel.setClass(a.content,t);});}}else a.setHeaderRemove(),e.addCloseControl&&a.addCloseControl();if(e.headerToolbar&&a.addToolbar(a.headertoolbar,e.headerToolbar),e.footerToolbar&&a.addToolbar(a.footer,e.footerToolbar),e.border&&a.setBorder(e.border),e.borderRadius&&a.setBorderRadius(e.borderRadius),e.css)for(const[t,o]of Object.entries(e.css))if("panel"===t)a.className+=` ${o}`;else {let e=a.querySelector(`.jsPanel-${t}`);e&&(e.className+=` ${o}`);}if(e.content&&("function"==typeof e.content?e.content.call(a,a):"string"==typeof e.content?a.content.innerHTML=e.content:a.content.append(e.content)),e.contentAjax&&this.ajax(e.contentAjax,a),e.contentFetch&&this.fetch(e.contentFetch,a),e.contentOverflow){const t=e.contentOverflow.split(" ");1===t.length?a.content.style.overflow=t[0]:2===t.length&&(a.content.style.overflowX=t[0],a.content.style.overflowY=t[1]);}if(e.autoclose){"number"==typeof e.autoclose?e.autoclose={time:e.autoclose+"ms"}:"string"==typeof e.autoclose&&(e.autoclose={time:e.autoclose});let t=Object.assign({},jsPanel.defaultAutocloseConfig,e.autoclose);t.time&&"number"==typeof t.time&&(t.time+="ms");let o=a.progressbar.querySelector("div");o.addEventListener("animationend",e=>{e.stopPropagation(),a.progressbar.classList.remove("active"),a.close();}),t.progressbar&&(a.progressbar.classList.add("active"),t.background?jsPanel.themes.indexOf(t.background)>-1?a.progressbar.classList.add(t.background+"-bg"):jsPanel.colorNames[t.background]?a.progressbar.style.background="#"+jsPanel.colorNames[t.background]:a.progressbar.style.background=t.background:a.progressbar.classList.add("success-bg")),o.style.animation=`${t.time} progressbar`;}if(e.rtl&&a.setRtl(),a.setSize(),a.status="normalized",e.position?this.position(a,e.position):a.style.opacity=1,document.dispatchEvent(i),a.calcSizeFactors(),e.animateIn&&(a.addEventListener("animationend",()=>{this.remClass(a,e.animateIn);}),this.setClass(a,e.animateIn)),e.syncMargins){let t=this.pOcontainment(e.maximizedMargin);e.dragit&&(e.dragit.containment=t,!0===e.dragit.snap?(e.dragit.snap=jsPanel.defaultSnapConfig,e.dragit.snap.containment=!0):e.dragit.snap&&(e.dragit.snap.containment=!0)),e.resizeit&&(e.resizeit.containment=t);}if(e.dragit?(["start","drag","stop"].forEach(t=>{e.dragit[t]?"function"==typeof e.dragit[t]&&(e.dragit[t]=[e.dragit[t]]):e.dragit[t]=[];}),a.drag(e.dragit),a.addEventListener("jspaneldragstop",e=>{e.panel===a&&a.calcSizeFactors();},!1)):a.titlebar.style.cursor="default",e.resizeit){["start","resize","stop"].forEach(t=>{e.resizeit[t]?"function"==typeof e.resizeit[t]&&(e.resizeit[t]=[e.resizeit[t]]):e.resizeit[t]=[];}),a.sizeit(e.resizeit);let t=void 0;a.addEventListener("jspanelresizestart",e=>{e.panel===a&&(t=a.status);},!1),a.addEventListener("jspanelresizestop",o=>{o.panel===a&&("smallified"===t||"smallifiedmax"===t||"maximized"===t)&&parseFloat(a.style.height)>parseFloat(window.getComputedStyle(a.header).height)&&(a.setControls([".jsPanel-btn-normalize"]),a.status="normalized",document.dispatchEvent(i),document.dispatchEvent(r),e.onstatuschange&&jsPanel.processCallbacks(a,e.onstatuschange,"every"),a.calcSizeFactors());},!1);}if(a.saveCurrentDimensions(!0),a.saveCurrentPosition(),e.setStatus&&("smallifiedmax"===e.setStatus?a.maximize().smallify():"smallified"===e.setStatus?a.smallify():a[e.setStatus.slice(0,-1)]()),this.pointerdown.forEach(t=>{a.addEventListener(t,t=>{t.target.closest(".jsPanel-btn-close")||t.target.closest(".jsPanel-btn-minimize")||"standard"!==e.paneltype||a.front();},!1);}),e.onwindowresize&&"window"===a.options.container&&window.addEventListener("resize",a.windowResizeHandler,!1),e.onparentresize){let t=e.onparentresize,o=typeof t,n=a.isChildpanel();if(n){const e=n.content;let s=[];a.parentResizeHandler=(r=>{if(r.panel===n){s[0]=e.offsetWidth,s[1]=e.offsetHeight;let n,r,l=a.status;"maximized"===l&&t?a.maximize():a.snapped&&"minimized"!==l?a.snap(a.snapped,!0):"normalized"===l||"smallified"===l||"maximized"===l?"function"===o?t.call(a,a,{width:s[0],height:s[1]}):"object"===o&&!0===t.preset?(n=(s[0]-a.offsetWidth)*a.hf,a.style.left=n<=0?0:n+"px",r=(s[1]-a.offsetHeight)*a.vf,a.style.top=r<=0?0:r+"px",t.callback.call(a,a,{width:s[0],height:s[1]})):"boolean"===o&&(n=(s[0]-a.offsetWidth)*a.hf,a.style.left=n<=0?0:n+"px",r=(s[1]-a.offsetHeight)*a.vf,a.style.top=r<=0?0:r+"px"):"smallifiedmax"===l&&t&&a.maximize().smallify();}}),document.addEventListener("jspanelresize",a.parentResizeHandler,!1);}}return this.globalCallbacks&&(Array.isArray(this.globalCallbacks)?this.globalCallbacks.forEach(e=>e.call(a,a)):this.globalCallbacks.call(a,a)),e.callback&&(Array.isArray(e.callback)?e.callback.forEach(e=>e.call(a,a)):e.callback.call(a,a)),t&&t.call(a,a),document.dispatchEvent(s),a}};

/* src/JsPanel.svelte generated by Svelte v3.52.0 */
const get_footerToolbar_slot_changes = dirty => ({});
const get_footerToolbar_slot_context = ctx => ({});
const get_content_slot_changes = dirty => ({});
const get_content_slot_context = ctx => ({});
const get_headerToolbar_slot_changes = dirty => ({});
const get_headerToolbar_slot_context = ctx => ({});
const get_headerTitle_slot_changes = dirty => ({});
const get_headerTitle_slot_context = ctx => ({});

function create_fragment(ctx) {
	let div4;
	let div0;
	let t0;
	let div1;
	let t1;
	let div2;
	let t2;
	let div3;
	let current;
	const headerTitle_slot_template = /*#slots*/ ctx[14].headerTitle;
	const headerTitle_slot = create_slot(headerTitle_slot_template, ctx, /*$$scope*/ ctx[13], get_headerTitle_slot_context);
	const headerToolbar_slot_template = /*#slots*/ ctx[14].headerToolbar;
	const headerToolbar_slot = create_slot(headerToolbar_slot_template, ctx, /*$$scope*/ ctx[13], get_headerToolbar_slot_context);
	const content_slot_template = /*#slots*/ ctx[14].content;
	const content_slot = create_slot(content_slot_template, ctx, /*$$scope*/ ctx[13], get_content_slot_context);
	const footerToolbar_slot_template = /*#slots*/ ctx[14].footerToolbar;
	const footerToolbar_slot = create_slot(footerToolbar_slot_template, ctx, /*$$scope*/ ctx[13], get_footerToolbar_slot_context);

	return {
		c() {
			div4 = element("div");
			div0 = element("div");
			if (headerTitle_slot) headerTitle_slot.c();
			t0 = space();
			div1 = element("div");
			if (headerToolbar_slot) headerToolbar_slot.c();
			t1 = space();
			div2 = element("div");
			if (content_slot) content_slot.c();
			t2 = space();
			div3 = element("div");
			if (footerToolbar_slot) footerToolbar_slot.c();
			set_style(div2, "width", "100%");
			set_style(div2, "height", "100%");
			set_style(div4, "display", "none");
		},
		m(target, anchor) {
			insert(target, div4, anchor);
			append(div4, div0);

			if (headerTitle_slot) {
				headerTitle_slot.m(div0, null);
			}

			/*div0_binding*/ ctx[15](div0);
			append(div4, t0);
			append(div4, div1);

			if (headerToolbar_slot) {
				headerToolbar_slot.m(div1, null);
			}

			/*div1_binding*/ ctx[16](div1);
			append(div4, t1);
			append(div4, div2);

			if (content_slot) {
				content_slot.m(div2, null);
			}

			/*div2_binding*/ ctx[17](div2);
			append(div4, t2);
			append(div4, div3);

			if (footerToolbar_slot) {
				footerToolbar_slot.m(div3, null);
			}

			/*div3_binding*/ ctx[18](div3);
			current = true;
		},
		p(ctx, [dirty]) {
			if (headerTitle_slot) {
				if (headerTitle_slot.p && (!current || dirty & /*$$scope*/ 8192)) {
					update_slot_base(
						headerTitle_slot,
						headerTitle_slot_template,
						ctx,
						/*$$scope*/ ctx[13],
						!current
						? get_all_dirty_from_scope(/*$$scope*/ ctx[13])
						: get_slot_changes(headerTitle_slot_template, /*$$scope*/ ctx[13], dirty, get_headerTitle_slot_changes),
						get_headerTitle_slot_context
					);
				}
			}

			if (headerToolbar_slot) {
				if (headerToolbar_slot.p && (!current || dirty & /*$$scope*/ 8192)) {
					update_slot_base(
						headerToolbar_slot,
						headerToolbar_slot_template,
						ctx,
						/*$$scope*/ ctx[13],
						!current
						? get_all_dirty_from_scope(/*$$scope*/ ctx[13])
						: get_slot_changes(headerToolbar_slot_template, /*$$scope*/ ctx[13], dirty, get_headerToolbar_slot_changes),
						get_headerToolbar_slot_context
					);
				}
			}

			if (content_slot) {
				if (content_slot.p && (!current || dirty & /*$$scope*/ 8192)) {
					update_slot_base(
						content_slot,
						content_slot_template,
						ctx,
						/*$$scope*/ ctx[13],
						!current
						? get_all_dirty_from_scope(/*$$scope*/ ctx[13])
						: get_slot_changes(content_slot_template, /*$$scope*/ ctx[13], dirty, get_content_slot_changes),
						get_content_slot_context
					);
				}
			}

			if (footerToolbar_slot) {
				if (footerToolbar_slot.p && (!current || dirty & /*$$scope*/ 8192)) {
					update_slot_base(
						footerToolbar_slot,
						footerToolbar_slot_template,
						ctx,
						/*$$scope*/ ctx[13],
						!current
						? get_all_dirty_from_scope(/*$$scope*/ ctx[13])
						: get_slot_changes(footerToolbar_slot_template, /*$$scope*/ ctx[13], dirty, get_footerToolbar_slot_changes),
						get_footerToolbar_slot_context
					);
				}
			}
		},
		i(local) {
			if (current) return;
			transition_in(headerTitle_slot, local);
			transition_in(headerToolbar_slot, local);
			transition_in(content_slot, local);
			transition_in(footerToolbar_slot, local);
			current = true;
		},
		o(local) {
			transition_out(headerTitle_slot, local);
			transition_out(headerToolbar_slot, local);
			transition_out(content_slot, local);
			transition_out(footerToolbar_slot, local);
			current = false;
		},
		d(detaching) {
			if (detaching) detach(div4);
			if (headerTitle_slot) headerTitle_slot.d(detaching);
			/*div0_binding*/ ctx[15](null);
			if (headerToolbar_slot) headerToolbar_slot.d(detaching);
			/*div1_binding*/ ctx[16](null);
			if (content_slot) content_slot.d(detaching);
			/*div2_binding*/ ctx[17](null);
			if (footerToolbar_slot) footerToolbar_slot.d(detaching);
			/*div3_binding*/ ctx[18](null);
		}
	};
}

function isUndefined(v) {
	return typeof v === 'undefined';
}

function instance($$self, $$props, $$invalidate) {
	let { $$slots: slots = {}, $$scope } = $$props;
	const $$slots = compute_slots(slots);
	let { border = undefined } = $$props;
	let { borderRadius = undefined } = $$props;
	let { headerLogo = undefined } = $$props;
	let { headerTitle = undefined } = $$props;
	let { theme = 'default' } = $$props;
	let { options = undefined } = $$props;
	let headerTitleElement;
	let headerToolbarElement;
	let contentElement;
	let footerToolbarElement;
	let panel;

	function show() {
		if (!panel) {
			const adjustedOptions = options ? { ...options } : {};

			const onclosedFunctions = [
				(_panel, closedByUser) => {
					$$invalidate(12, panel = null);
					return true;
				}
			];

			if (options && options.onclosed) {
				if (Array.isArray(options.onclosed)) {
					onclosedFunctions.push(...options.onclosed);
				} else {
					onclosedFunctions.push(options.onclosed);
				}
			}

			adjustedOptions.onclosed = onclosedFunctions;

			if (!isUndefined(border)) {
				adjustedOptions.border = border;
			}

			if (!isUndefined(borderRadius)) {
				adjustedOptions.borderRadius = borderRadius;
			}

			if (!isUndefined(headerLogo)) {
				adjustedOptions.headerLogo = headerLogo;
			}

			if (!isUndefined(headerTitle)) {
				adjustedOptions.headerTitle = headerTitle;
			}

			if (!isUndefined(theme)) {
				adjustedOptions.theme = theme;
			}

			if ($$slots['headerTitle']) {
				adjustedOptions.headerTitle = headerTitleElement;
			}

			if ($$slots['content']) {
				adjustedOptions.content = contentElement;
			}

			if ($$slots['headerToolbar']) {
				adjustedOptions.headerToolbar = headerToolbarElement;
			}

			if ($$slots['footerToolbar']) {
				adjustedOptions.footerToolbar = footerToolbarElement;
			}

			$$invalidate(12, panel = jsPanel.create(adjustedOptions));
		}
	}

	function getPanel() {
		return panel;
	}

	function div0_binding($$value) {
		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
			headerTitleElement = $$value;
			$$invalidate(0, headerTitleElement);
		});
	}

	function div1_binding($$value) {
		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
			headerToolbarElement = $$value;
			$$invalidate(1, headerToolbarElement);
		});
	}

	function div2_binding($$value) {
		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
			contentElement = $$value;
			$$invalidate(2, contentElement);
		});
	}

	function div3_binding($$value) {
		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
			footerToolbarElement = $$value;
			$$invalidate(3, footerToolbarElement);
		});
	}

	$$self.$$set = $$props => {
		if ('border' in $$props) $$invalidate(4, border = $$props.border);
		if ('borderRadius' in $$props) $$invalidate(5, borderRadius = $$props.borderRadius);
		if ('headerLogo' in $$props) $$invalidate(6, headerLogo = $$props.headerLogo);
		if ('headerTitle' in $$props) $$invalidate(7, headerTitle = $$props.headerTitle);
		if ('theme' in $$props) $$invalidate(8, theme = $$props.theme);
		if ('options' in $$props) $$invalidate(9, options = $$props.options);
		if ('$$scope' in $$props) $$invalidate(13, $$scope = $$props.$$scope);
	};

	$$self.$$.update = () => {
		if ($$self.$$.dirty & /*panel, border, borderRadius, headerLogo, headerTitle, theme*/ 4592) {
			{
				if (panel) {
					if (!isUndefined(border)) {
						panel.setBorder(border);
					}

					if (!isUndefined(borderRadius)) {
						panel.setBorderRadius(borderRadius);
					}

					if (!isUndefined(headerLogo)) {
						panel.setHeaderLogo(headerLogo);
					}

					if (!isUndefined(headerTitle) && !$$slots['headerTitle']) {
						panel.setHeaderTitle(headerTitle);
					}

					if (!isUndefined(theme)) {
						panel.setTheme(theme);
					}
				}
			}
		}
	};

	return [
		headerTitleElement,
		headerToolbarElement,
		contentElement,
		footerToolbarElement,
		border,
		borderRadius,
		headerLogo,
		headerTitle,
		theme,
		options,
		show,
		getPanel,
		panel,
		$$scope,
		slots,
		div0_binding,
		div1_binding,
		div2_binding,
		div3_binding
	];
}

class JsPanel extends SvelteComponent {
	constructor(options) {
		super();

		init(this, options, instance, create_fragment, safe_not_equal, {
			border: 4,
			borderRadius: 5,
			headerLogo: 6,
			headerTitle: 7,
			theme: 8,
			options: 9,
			show: 10,
			getPanel: 11
		});
	}

	get show() {
		return this.$$.ctx[10];
	}

	get getPanel() {
		return this.$$.ctx[11];
	}
}

export { JsPanel as default };
