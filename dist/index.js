(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
    typeof define === 'function' && define.amd ? define(factory) :
    (global = global || self, global.Jspanel4 = factory());
}(this, (function () { 'use strict';

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
    function update_slot(slot, slot_definition, ctx, $$scope, dirty, get_slot_changes_fn, get_slot_context_fn) {
        const slot_changes = get_slot_changes(slot_definition, $$scope, dirty, get_slot_changes_fn);
        if (slot_changes) {
            const slot_context = get_slot_context(slot_definition, ctx, $$scope, get_slot_context_fn);
            slot.p(slot_context, slot_changes);
        }
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
        node.style.setProperty(key, value, important ? 'important' : '');
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
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            set_current_component(null);
            dirty_components.length = 0;
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
        flushing = false;
        seen_callbacks.clear();
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
    }
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
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
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const prop_values = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, prop_values, (i, ret, ...rest) => {
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
            mount_component(component, options.target, options.anchor);
            flush();
        }
        set_current_component(parent_component);
    }
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
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

    let jsPanel={version:"4.10.2",date:"2020-05-01 08:07",ajaxAlwaysCallbacks:[],autopositionSpacing:4,closeOnEscape:void document.addEventListener("keydown",e=>{"Escape"!==e.key&&"Escape"!==e.code&&"Esc"!==e.key||jsPanel.getPanels(function(){return this.classList.contains("jsPanel")}).some(e=>!!e.options.closeOnEscape&&(e.close(null,!0),!0));},!1),defaults:{boxShadow:3,container:"window",contentSize:{width:"400px",height:"200px"},dragit:{cursor:"move",handles:".jsPanel-headerlogo, .jsPanel-titlebar, .jsPanel-ftr",opacity:.8,disableOnMaximized:!0},header:!0,headerTitle:"jsPanel",headerControls:{size:"md"},iconfont:void 0,maximizedMargin:0,minimizeTo:"default",paneltype:"standard",position:{my:"center",at:"center"},resizeit:{handles:"n, e, s, w, ne, se, sw, nw",minWidth:128,minHeight:38},theme:"default"},defaultAutocloseConfig:{time:"8s",progressbar:!0},defaultSnapConfig:{sensitivity:70,trigger:"panel",active:"both"},extensions:{},globalCallbacks:!1,icons:{close:'<svg focusable="false" class="jsPanel-icon" version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 22"><path fill="currentColor" d="M13.7,11l6.1-6.1c0.4-0.4,0.4-0.9,0-1.3l-1.4-1.4c-0.4-0.4-0.9-0.4-1.3,0L11,8.3L4.9,2.3C4.6,1.9,4,1.9,3.7,2.3L2.3,3.7 C1.9,4,1.9,4.6,2.3,4.9L8.3,11l-6.1,6.1c-0.4,0.4-0.4,0.9,0,1.3l1.4,1.4c0.4,0.4,0.9,0.4,1.3,0l6.1-6.1l6.1,6.1 c0.4,0.4,0.9,0.4,1.3,0l1.4-1.4c0.4-0.4,0.4-0.9,0-1.3L13.7,11z"/></svg>',maximize:'<svg focusable="false" class="jsPanel-icon" version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 22"><path fill="currentColor" d="M18.3,2H3.7C2.8,2,2,2.9,2,3.9v14.1C2,19.1,2.8,20,3.7,20h14.6c0.9,0,1.7-0.9,1.7-1.9V3.9C20,2.9,19.2,2,18.3,2z M18.3,17.8 c0,0.1-0.1,0.2-0.2,0.2H3.9c-0.1,0-0.2-0.1-0.2-0.2V8.4h14.6V17.8z"/></svg>',normalize:'<svg focusable="false" class="jsPanel-icon" version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 22"><path fill="currentColor" d="M18.3,2H7.1C6.1,2,5.4,2.8,5.4,3.7v1.7H3.7C2.8,5.4,2,6.1,2,7.1v11.3C2,19.2,2.8,20,3.7,20h11.3c0.9,0,1.7-0.8,1.7-1.7v-1.7 h1.7c0.9,0,1.7-0.8,1.7-1.7V3.7C20,2.8,19.2,2,18.3,2z M14.9,18.3H3.7V11h11.3V18.3z M18.3,14.9h-1.7V7.1c0-0.9-0.8-1.7-1.7-1.7H7.1 V3.7h11.3V14.9z"/></svg>',minimize:'<svg focusable="false" class="jsPanel-icon" version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 22"><path fill="currentColor" d="M18.9,19.8H3.1c-0.6,0-1.1-0.5-1.1-1.1s0.5-1.1,1.1-1.1h15.8c0.6,0,1.1,0.5,1.1,1.1S19.5,19.8,18.9,19.8z"/></svg>',smallify:'<svg focusable="false" class="jsPanel-icon" version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 22"><path fill="currentColor" d="M2.1,15.2L2.9,16c0.2,0.2,0.5,0.2,0.7,0L11,8.7l7.4,7.3c0.2,0.2,0.5,0.2,0.7,0l0.8-0.8c0.2-0.2,0.2-0.5,0-0.7L11.3,6 c-0.2-0.2-0.5-0.2-0.7,0l-8.5,8.5C2,14.7,2,15,2.1,15.2z"/></svg>'},idCounter:0,isIE:(()=>navigator.appVersion.match(/Trident/))(),pointerdown:"onpointerdown"in window?["pointerdown"]:"ontouchend"in window?["touchstart","mousedown"]:["mousedown"],pointermove:"onpointermove"in window?["pointermove"]:"ontouchend"in window?["touchmove","mousemove"]:["mousemove"],pointerup:"onpointerup"in window?["pointerup"]:"ontouchend"in window?["touchend","mouseup"]:["mouseup"],polyfills:(Object.assign||Object.defineProperty(Object,"assign",{enumerable:!1,configurable:!0,writable:!0,value:function(e){if(null==e)throw new TypeError("Cannot convert first argument to object");let t=Object(e);for(let e=1;e<arguments.length;e++){let n=arguments[e];if(null==n)continue;n=Object(n);let o=Object.keys(Object(n));for(let e=0,a=o.length;e<a;e++){let a=o[e],s=Object.getOwnPropertyDescriptor(n,a);void 0!==s&&s.enumerable&&(t[a]=n[a]);}}return t}}),window.NodeList&&!NodeList.prototype.forEach&&(NodeList.prototype.forEach=function(e,t){t=t||window;for(let n=0;n<this.length;n++)e.call(t,this[n],n,this);}),void[Element.prototype,Document.prototype,DocumentFragment.prototype].forEach(function(e){e.append=e.append||function(){let e=Array.prototype.slice.call(arguments),t=document.createDocumentFragment();e.forEach(function(e){let n=e instanceof Node;t.appendChild(n?e:document.createTextNode(String(e)));}),this.appendChild(t);};}),window.Element&&!Element.prototype.closest&&(Element.prototype.closest=function(e){let t,n=(this.document||this.ownerDocument).querySelectorAll(e),o=this;do{for(t=n.length;--t>=0&&n.item(t)!==o;);}while(t<0&&(o=o.parentElement));return o}),function(){if("function"==typeof window.CustomEvent)return !1;function e(e,t){t=t||{bubbles:!1,cancelable:!1,detail:void 0};let n=document.createEvent("CustomEvent");return n.initCustomEvent(e,t.bubbles,t.cancelable,t.detail),n}e.prototype=window.Event.prototype,window.CustomEvent=e;}(),String.prototype.endsWith||(String.prototype.endsWith=function(e,t){return t<this.length?t|=0:t=this.length,this.substr(t-e.length,e.length)===e}),String.prototype.startsWith||(String.prototype.startsWith=function(e,t){return this.substr(t||0,e.length)===e}),String.prototype.includes||(String.prototype.includes=function(e,t){return "number"!=typeof t&&(t=0),!(t+e.length>this.length)&&-1!==this.indexOf(e,t)}),Number.isInteger=Number.isInteger||function(e){return "number"==typeof e&&isFinite(e)&&Math.floor(e)===e},void(Array.prototype.includes||Object.defineProperty(Array.prototype,"includes",{value:function(e,t){if(null==this)throw new TypeError('"this" is null or not defined');let n=Object(this),o=n.length>>>0;if(0===o)return !1;let a=0|t,s=Math.max(a>=0?a:o-Math.abs(a),0);for(;s<o;){if((l=n[s])===(i=e)||"number"==typeof l&&"number"==typeof i&&isNaN(l)&&isNaN(i))return !0;s++;}var l,i;return !1}}))),themes:["default","primary","secondary","info","success","warning","danger","light","dark"],ziBase:100,colorFilledLight:.81,colorFilledDark:.08,colorFilled:0,colorBrightnessThreshold:.55,colorNames:{aliceblue:"f0f8ff",antiquewhite:"faebd7",aqua:"0ff",aquamarine:"7fffd4",azure:"f0ffff",beige:"f5f5dc",bisque:"ffe4c4",black:"000",blanchedalmond:"ffebcd",blue:"00f",blueviolet:"8a2be2",brown:"a52a2a",burlywood:"deb887",cadetblue:"5f9ea0",chartreuse:"7fff00",chocolate:"d2691e",coral:"ff7f50",cornflowerblue:"6495ed",cornsilk:"fff8dc",crimson:"dc143c",cyan:"0ff",darkblue:"00008b",darkcyan:"008b8b",darkgoldenrod:"b8860b",darkgray:"a9a9a9",darkgrey:"a9a9a9",darkgreen:"006400",darkkhaki:"bdb76b",darkmagenta:"8b008b",darkolivegreen:"556b2f",darkorange:"ff8c00",darkorchid:"9932cc",darkred:"8b0000",darksalmon:"e9967a",darkseagreen:"8fbc8f",darkslateblue:"483d8b",darkslategray:"2f4f4f",darkslategrey:"2f4f4f",darkturquoise:"00ced1",darkviolet:"9400d3",deeppink:"ff1493",deepskyblue:"00bfff",dimgray:"696969",dimgrey:"696969",dodgerblue:"1e90ff",firebrick:"b22222",floralwhite:"fffaf0",forestgreen:"228b22",fuchsia:"f0f",gainsboro:"dcdcdc",ghostwhite:"f8f8ff",gold:"ffd700",goldenrod:"daa520",gray:"808080",grey:"808080",green:"008000",greenyellow:"adff2f",honeydew:"f0fff0",hotpink:"ff69b4",indianred:"cd5c5c",indigo:"4b0082",ivory:"fffff0",khaki:"f0e68c",lavender:"e6e6fa",lavenderblush:"fff0f5",lawngreen:"7cfc00",lemonchiffon:"fffacd",lightblue:"add8e6",lightcoral:"f08080",lightcyan:"e0ffff",lightgoldenrodyellow:"fafad2",lightgray:"d3d3d3",lightgrey:"d3d3d3",lightgreen:"90ee90",lightpink:"ffb6c1",lightsalmon:"ffa07a",lightseagreen:"20b2aa",lightskyblue:"87cefa",lightslategray:"789",lightslategrey:"789",lightsteelblue:"b0c4de",lightyellow:"ffffe0",lime:"0f0",limegreen:"32cd32",linen:"faf0e6",magenta:"f0f",maroon:"800000",mediumaquamarine:"66cdaa",mediumblue:"0000cd",mediumorchid:"ba55d3",mediumpurple:"9370d8",mediumseagreen:"3cb371",mediumslateblue:"7b68ee",mediumspringgreen:"00fa9a",mediumturquoise:"48d1cc",mediumvioletred:"c71585",midnightblue:"191970",mintcream:"f5fffa",mistyrose:"ffe4e1",moccasin:"ffe4b5",navajowhite:"ffdead",navy:"000080",oldlace:"fdf5e6",olive:"808000",olivedrab:"6b8e23",orange:"ffa500",orangered:"ff4500",orchid:"da70d6",palegoldenrod:"eee8aa",palegreen:"98fb98",paleturquoise:"afeeee",palevioletred:"d87093",papayawhip:"ffefd5",peachpuff:"ffdab9",peru:"cd853f",pink:"ffc0cb",plum:"dda0dd",powderblue:"b0e0e6",purple:"800080",rebeccapurple:"639",red:"f00",rosybrown:"bc8f8f",royalblue:"4169e1",saddlebrown:"8b4513",salmon:"fa8072",sandybrown:"f4a460",seagreen:"2e8b57",seashell:"fff5ee",sienna:"a0522d",silver:"c0c0c0",skyblue:"87ceeb",slateblue:"6a5acd",slategray:"708090",slategrey:"708090",snow:"fffafa",springgreen:"00ff7f",steelblue:"4682b4",tan:"d2b48c",teal:"008080",thistle:"d8bfd8",tomato:"ff6347",turquoise:"40e0d0",violet:"ee82ee",wheat:"f5deb3",white:"fff",whitesmoke:"f5f5f5",yellow:"ff0",yellowgreen:"9acd32",grey50:"fafafa",grey100:"f5f5f5",grey200:"eee",grey300:"e0e0e0",grey400:"bdbdbd",grey500:"9e9e9e",grey600:"757575",grey700:"616161",grey800:"424242",grey900:"212121",gray50:"fafafa",gray100:"f5f5f5",gray200:"eee",gray300:"e0e0e0",gray400:"bdbdbd",gray500:"9e9e9e",gray600:"757575",gray700:"616161",gray800:"424242",gray900:"212121",bluegrey50:"eceff1",bluegrey100:"CFD8DC",bluegrey200:"B0BEC5",bluegrey300:"90A4AE",bluegrey400:"78909C",bluegrey500:"607D8B",bluegrey600:"546E7A",bluegrey700:"455A64",bluegrey800:"37474F",bluegrey900:"263238",bluegray50:"eceff1",bluegray100:"CFD8DC",bluegray200:"B0BEC5",bluegray300:"90A4AE",bluegray400:"78909C",bluegray500:"607D8B",bluegray600:"546E7A",bluegray700:"455A64",bluegray800:"37474F",bluegray900:"263238",red50:"FFEBEE",red100:"FFCDD2",red200:"EF9A9A",red300:"E57373",red400:"EF5350",red500:"F44336",red600:"E53935",red700:"D32F2F",red800:"C62828",red900:"B71C1C",reda100:"FF8A80",reda200:"FF5252",reda400:"FF1744",reda700:"D50000",pink50:"FCE4EC",pink100:"F8BBD0",pink200:"F48FB1",pink300:"F06292",pink400:"EC407A",pink500:"E91E63",pink600:"D81B60",pink700:"C2185B",pink800:"AD1457",pink900:"880E4F",pinka100:"FF80AB",pinka200:"FF4081",pinka400:"F50057",pinka700:"C51162",purple50:"F3E5F5",purple100:"E1BEE7",purple200:"CE93D8",purple300:"BA68C8",purple400:"AB47BC",purple500:"9C27B0",purple600:"8E24AA",purple700:"7B1FA2",purple800:"6A1B9A",purple900:"4A148C",purplea100:"EA80FC",purplea200:"E040FB",purplea400:"D500F9",purplea700:"AA00FF",deeppurple50:"EDE7F6",deeppurple100:"D1C4E9",deeppurple200:"B39DDB",deeppurple300:"9575CD",deeppurple400:"7E57C2",deeppurple500:"673AB7",deeppurple600:"5E35B1",deeppurple700:"512DA8",deeppurple800:"4527A0",deeppurple900:"311B92",deeppurplea100:"B388FF",deeppurplea200:"7C4DFF",deeppurplea400:"651FFF",deeppurplea700:"6200EA",indigo50:"E8EAF6",indigo100:"C5CAE9",indigo200:"9FA8DA",indigo300:"7986CB",indigo400:"5C6BC0",indigo500:"3F51B5",indigo600:"3949AB",indigo700:"303F9F",indigo800:"283593",indigo900:"1A237E",indigoa100:"8C9EFF",indigoa200:"536DFE",indigoa400:"3D5AFE",indigoa700:"304FFE",blue50:"E3F2FD",blue100:"BBDEFB",blue200:"90CAF9",blue300:"64B5F6",blue400:"42A5F5",blue500:"2196F3",blue600:"1E88E5",blue700:"1976D2",blue800:"1565C0",blue900:"0D47A1",bluea100:"82B1FF",bluea200:"448AFF",bluea400:"2979FF",bluea700:"2962FF",lightblue50:"E1F5FE",lightblue100:"B3E5FC",lightblue200:"81D4FA",lightblue300:"4FC3F7",lightblue400:"29B6F6",lightblue500:"03A9F4",lightblue600:"039BE5",lightblue700:"0288D1",lightblue800:"0277BD",lightblue900:"01579B",lightbluea100:"80D8FF",lightbluea200:"40C4FF",lightbluea400:"00B0FF",lightbluea700:"0091EA",cyan50:"E0F7FA",cyan100:"B2EBF2",cyan200:"80DEEA",cyan300:"4DD0E1",cyan400:"26C6DA",cyan500:"00BCD4",cyan600:"00ACC1",cyan700:"0097A7",cyan800:"00838F",cyan900:"006064",cyana100:"84FFFF",cyana200:"18FFFF",cyana400:"00E5FF",cyana700:"00B8D4",teal50:"E0F2F1",teal100:"B2DFDB",teal200:"80CBC4",teal300:"4DB6AC",teal400:"26A69A",teal500:"009688",teal600:"00897B",teal700:"00796B",teal800:"00695C",teal900:"004D40",teala100:"A7FFEB",teala200:"64FFDA",teala400:"1DE9B6",teala700:"00BFA5",green50:"E8F5E9",green100:"C8E6C9",green200:"A5D6A7",green300:"81C784",green400:"66BB6A",green500:"4CAF50",green600:"43A047",green700:"388E3C",green800:"2E7D32",green900:"1B5E20",greena100:"B9F6CA",greena200:"69F0AE",greena400:"00E676",greena700:"00C853",lightgreen50:"F1F8E9",lightgreen100:"DCEDC8",lightgreen200:"C5E1A5",lightgreen300:"AED581",lightgreen400:"9CCC65",lightgreen500:"8BC34A",lightgreen600:"7CB342",lightgreen700:"689F38",lightgreen800:"558B2F",lightgreen900:"33691E",lightgreena100:"CCFF90",lightgreena200:"B2FF59",lightgreena400:"76FF03",lightgreena700:"64DD17",lime50:"F9FBE7",lime100:"F0F4C3",lime200:"E6EE9C",lime300:"DCE775",lime400:"D4E157",lime500:"CDDC39",lime600:"C0CA33",lime700:"AFB42B",lime800:"9E9D24",lime900:"827717",limea100:"F4FF81",limea200:"EEFF41",limea400:"C6FF00",limea700:"AEEA00",yellow50:"FFFDE7",yellow100:"FFF9C4",yellow200:"FFF59D",yellow300:"FFF176",yellow400:"FFEE58",yellow500:"FFEB3B",yellow600:"FDD835",yellow700:"FBC02D",yellow800:"F9A825",yellow900:"F57F17",yellowa100:"FFFF8D",yellowa200:"FFFF00",yellowa400:"FFEA00",yellowa700:"FFD600",amber50:"FFF8E1",amber100:"FFECB3",amber200:"FFE082",amber300:"FFD54F",amber400:"FFCA28",amber500:"FFC107",amber600:"FFB300",amber700:"FFA000",amber800:"FF8F00",amber900:"FF6F00",ambera100:"FFE57F",ambera200:"FFD740",ambera400:"FFC400",ambera700:"FFAB00",orange50:"FFF3E0",orange100:"FFE0B2",orange200:"FFCC80",orange300:"FFB74D",orange400:"FFA726",orange500:"FF9800",orange600:"FB8C00",orange700:"F57C00",orange800:"EF6C00",orange900:"E65100",orangea100:"FFD180",orangea200:"FFAB40",orangea400:"FF9100",orangea700:"FF6D00",deeporange50:"FBE9E7",deeporange100:"FFCCBC",deeporange200:"FFAB91",deeporange300:"FF8A65",deeporange400:"FF7043",deeporange500:"FF5722",deeporange600:"F4511E",deeporange700:"E64A19",deeporange800:"D84315",deeporange900:"BF360C",deeporangea100:"FF9E80",deeporangea200:"FF6E40",deeporangea400:"FF3D00",deeporangea700:"DD2C00",brown50:"EFEBE9",brown100:"D7CCC8",brown200:"BCAAA4",brown300:"A1887F",brown400:"8D6E63",brown500:"795548",brown600:"6D4C41",brown700:"5D4037",brown800:"4E342E",brown900:"3E2723"},errorReporting:1,modifier:!1,helper:(document.addEventListener("keydown",e=>{jsPanel.modifier=e;}),void document.addEventListener("keyup",()=>{jsPanel.modifier=!1;})),color(e){let t,n,o,a,s,l,i,r,c,d=e.toLowerCase(),p={};const h=/^rgba?\(([0-9]{1,3}),([0-9]{1,3}),([0-9]{1,3}),?(0|1|0\.[0-9]{1,2}|\.[0-9]{1,2})?\)$/gi,f=/^hsla?\(([0-9]{1,3}),([0-9]{1,3}%),([0-9]{1,3}%),?(0|1|0\.[0-9]{1,2}|\.[0-9]{1,2})?\)$/gi,m=this.colorNames;return m[d]&&(d=m[d]),null!==d.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/gi)?((d=d.replace("#","")).length%2==1?(t=String(d.substr(0,1))+d.substr(0,1),n=String(d.substr(1,1))+d.substr(1,1),o=String(d.substr(2,1))+d.substr(2,1),p.rgb={r:parseInt(t,16),g:parseInt(n,16),b:parseInt(o,16)},p.hex=`#${t}${n}${o}`):(p.rgb={r:parseInt(d.substr(0,2),16),g:parseInt(d.substr(2,2),16),b:parseInt(d.substr(4,2),16)},p.hex=`#${d}`),c=this.rgbToHsl(p.rgb.r,p.rgb.g,p.rgb.b),p.hsl=c,p.rgb.css=`rgb(${p.rgb.r},${p.rgb.g},${p.rgb.b})`):d.match(h)?(i=h.exec(d),p.rgb={css:d,r:i[1],g:i[2],b:i[3]},p.hex=this.rgbToHex(i[1],i[2],i[3]),c=this.rgbToHsl(i[1],i[2],i[3]),p.hsl=c):d.match(f)?(a=(i=f.exec(d))[1]/360,s=i[2].substr(0,i[2].length-1)/100,l=i[3].substr(0,i[3].length-1)/100,r=this.hslToRgb(a,s,l),p.rgb={css:`rgb(${r[0]},${r[1]},${r[2]})`,r:r[0],g:r[1],b:r[2]},p.hex=this.rgbToHex(p.rgb.r,p.rgb.g,p.rgb.b),p.hsl={css:`hsl(${i[1]},${i[2]},${i[3]})`,h:i[1],s:i[2],l:i[3]}):(p.hex="#f5f5f5",p.rgb={css:"rgb(245,245,245)",r:245,g:245,b:245},p.hsl={css:"hsl(0,0%,96%)",h:0,s:"0%",l:"96%"}),p},calcColors(e){const t=this.colorBrightnessThreshold,n=this.color(e),o=this.lighten(e,this.colorFilledLight),a=this.darken(e,this.colorFilled),s=this.perceivedBrightness(e)<=t?"#ffffff":"#000000",l=this.perceivedBrightness(o)<=t?"#ffffff":"#000000",i=this.perceivedBrightness(a)<=t?"#ffffff":"#000000",r=this.lighten(e,this.colorFilledDark),c=this.perceivedBrightness(r)<=t?"#ffffff":"#000000";return [n.hsl.css,o,a,s,l,i,r,c]},darken(e,t){const n=this.color(e).hsl,o=parseFloat(n.l),a=Math.round(o-o*t)+"%";return `hsl(${n.h},${n.s},${a})`},lighten(e,t){const n=this.color(e).hsl,o=parseFloat(n.l),a=Math.round(o+(100-o)*t)+"%";return `hsl(${n.h},${n.s},${a})`},hslToRgb(e,t,n){let o,a,s;if(0===t)o=a=s=n;else {let l=(e,t,n)=>(n<0&&(n+=1),n>1&&(n-=1),n<1/6?e+6*(t-e)*n:n<.5?t:n<2/3?e+(t-e)*(2/3-n)*6:e),i=n<.5?n*(1+t):n+t-n*t,r=2*n-i;o=l(r,i,e+1/3),a=l(r,i,e),s=l(r,i,e-1/3);}return [Math.round(255*o),Math.round(255*a),Math.round(255*s)]},rgbToHsl(e,t,n){e/=255,t/=255,n/=255;let o,a,s=Math.max(e,t,n),l=Math.min(e,t,n),i=(s+l)/2;if(s===l)o=a=0;else {let r=s-l;switch(a=i>.5?r/(2-s-l):r/(s+l),s){case e:o=(t-n)/r+(t<n?6:0);break;case t:o=(n-e)/r+2;break;case n:o=(e-t)/r+4;}o/=6;}return {css:"hsl("+(o=Math.round(360*o))+","+(a=Math.round(100*a)+"%")+","+(i=Math.round(100*i)+"%")+")",h:o,s:a,l:i}},rgbToHex(e,t,n){let o=Number(e).toString(16),a=Number(t).toString(16),s=Number(n).toString(16);return 1===o.length&&(o=`0${o}`),1===a.length&&(a=`0${a}`),1===s.length&&(s=`0${s}`),`#${o}${a}${s}`},perceivedBrightness(e){const t=this.color(e).rgb;return t.r/255*.2126+t.g/255*.7152+t.b/255*.0722},pOposition(e){let t={},n=e.trim().split(/\s+/),o=n.filter(e=>e.match(/^(down|right|up|left)$/i));o.length&&(t.autoposition=o[0],n.splice(n.indexOf(o[0]),1));let a=n.filter(e=>e.match(/^(left-|right-)(top|center|bottom)$|(^center-)(top|bottom)$|(^center$)/i));a.length?(t.my=a[0],t.at=a[1]||a[0],n.splice(n.indexOf(a[0]),1),a[1]&&n.splice(n.indexOf(a[1]),1)):(t.my="center",t.at="center");let s=n.filter(e=>e.match(/^[+-]?\d*\.?\d+[a-z%]*$/i));return s.length&&(t.offsetX=s[0].match(/^[+-]?\d*\.?\d+$/i)?`${s[0]}px`:s[0],s[1]?t.offsetY=s[1].match(/^[+-]?\d*\.?\d+$/i)?`${s[1]}px`:s[1]:t.offsetY=t.offsetX,n.splice(n.indexOf(s[0]),1),s[1]&&n.splice(n.indexOf(s[1]),1)),n.length&&(t.of=n.join(" ")),t},position(e,t){if(!t)return e.style.opacity=1,e;t="string"==typeof t?Object.assign({},this.defaults.position,this.pOposition(t)):Object.assign({},this.defaults.position,t),["my","at","of"].forEach(n=>{"function"==typeof t[n]&&(t[n]=t[n].call(e,e));}),"window"===e.options.container&&(e.style.position="fixed"),"string"==typeof e?e=document.querySelector(e):Object.getPrototypeOf(e).jquery&&(e=e[0]);const n="window"===e.options.container?"window":e.parentElement,o=e.getBoundingClientRect(),a=e.parentElement.getBoundingClientRect(),s="window"===n?{left:0,top:0,width:document.documentElement.clientWidth,height:window.innerHeight}:{width:a.width,height:a.height,left:a.left,top:a.top},l="window"===n?{x:1,y:1}:{x:s.width/n.offsetWidth,y:s.height/n.offsetHeight},i="window"===n?{borderTopWidth:"0px",borderRightWidth:"0px",borderBottomWidth:"0px",borderLeftWidth:"0px"}:window.getComputedStyle(n);let r;s.width-=(parseFloat(i.borderLeftWidth)+parseFloat(i.borderRightWidth))*l.x,s.height-=(parseFloat(i.borderTopWidth)+parseFloat(i.borderBottomWidth))*l.y,r=t.of?"string"==typeof t.of?"window"===t.of?{borderTopWidth:"0px",borderRightWidth:"0px",borderBottomWidth:"0px",borderLeftWidth:"0px"}:document.querySelector(t.of).getBoundingClientRect():Object.getPrototypeOf(t.of).jquery?t.of[0].getBoundingClientRect():t.of.getBoundingClientRect():s;let c="0px";t.my.startsWith("left-")?t.at.startsWith("left-")?c=t.of?r.left-s.left-parseFloat(i.borderLeftWidth)+"px":"0px":t.at.startsWith("center")?c=t.of?r.left-s.left-parseFloat(i.borderLeftWidth)+r.width/2+"px":s.width/2+"px":t.at.startsWith("right-")&&(c=t.of?r.left-s.left-parseFloat(i.borderLeftWidth)+r.width+"px":s.width+"px"):t.my.startsWith("center")?t.at.startsWith("left-")?c=t.of?r.left-s.left-parseFloat(i.borderLeftWidth)-o.width/2+"px":-o.width/2+"px":t.at.startsWith("center")?c=t.of?r.left-s.left-parseFloat(i.borderLeftWidth)-(o.width-r.width)/2+"px":s.width/2-o.width/2+"px":t.at.startsWith("right-")&&(c=t.of?r.left-s.left-parseFloat(i.borderLeftWidth)+(r.width-o.width/2)+"px":s.width-o.width/2+"px"):t.my.startsWith("right-")&&(t.at.startsWith("left-")?c=t.of?r.left-s.left-parseFloat(i.borderLeftWidth)-o.width+"px":-o.width+"px":t.at.startsWith("center")?c=t.of?r.left-s.left-parseFloat(i.borderLeftWidth)-o.width+r.width/2+"px":s.width/2-o.width+"px":t.at.startsWith("right-")&&(c=t.of?r.left-s.left-parseFloat(i.borderLeftWidth)+r.width-o.width+"px":s.width-o.width+"px"));let d="0px";t.my.endsWith("-top")?t.at.endsWith("-top")?d=t.of?r.top-s.top-parseFloat(i.borderTopWidth)+"px":"0px":t.at.endsWith("center")?d=t.of?r.top-s.top-parseFloat(i.borderTopWidth)+r.height/2+"px":s.height/2+"px":t.at.endsWith("-bottom")&&(d=t.of?r.top-s.top-parseFloat(i.borderTopWidth)+r.height+"px":s.height+"px"):t.my.endsWith("center")?t.at.endsWith("-top")?d=t.of?r.top-s.top-parseFloat(i.borderTopWidth)-o.height/2+"px":-o.height/2+"px":t.at.endsWith("center")?d=t.of?r.top-s.top-parseFloat(i.borderTopWidth)-o.height/2+r.height/2+"px":s.height/2-o.height/2+"px":t.at.endsWith("-bottom")&&(d=t.of?r.top-s.top-parseFloat(i.borderTopWidth)-o.height/2+r.height+"px":s.height-o.height/2+"px"):t.my.endsWith("-bottom")&&(t.at.endsWith("-top")?d=t.of?r.top-s.top-parseFloat(i.borderTopWidth)-o.height+"px":-o.height+"px":t.at.endsWith("center")?d=t.of?r.top-s.top-parseFloat(i.borderTopWidth)-o.height+r.height/2+"px":s.height/2-o.height+"px":t.at.endsWith("-bottom")&&(d=t.of?r.top-s.top-parseFloat(i.borderTopWidth)-o.height+r.height+"px":s.height-o.height+"px")),e.style.left=1===l.x?c:parseFloat(c)/l.x+"px",e.style.top=1===l.y?d:parseFloat(d)/l.y+"px";let p=getComputedStyle(e),h={left:p.left,top:p.top};return t.autoposition&&t.my===t.at&&["left-top","center-top","right-top","left-bottom","center-bottom","right-bottom"].indexOf(t.my)>=0&&(h=this.applyPositionAutopos(e,h,t)),(t.offsetX||t.offsetY)&&(h=this.applyPositionOffset(e,h,t)),(t.minLeft||t.minTop||t.maxLeft||t.maxTop)&&(h=this.applyPositionMinMax(e,h,t)),t.modify&&(h=this.applyPositionModify(e,h,t)),e.style.opacity=1,e},applyPositionAutopos(e,t,n){const o=`${n.my}-${n.autoposition.toLowerCase()}`;e.classList.add(o);const a=Array.prototype.slice.call(document.querySelectorAll(`.${o}`)),s=a.indexOf(e);if(a.length>1){switch(n.autoposition){case"down":a.forEach((e,n)=>{n>0&&n<=s&&(t.top=parseFloat(t.top)+a[--n].getBoundingClientRect().height+jsPanel.autopositionSpacing+"px");});break;case"up":a.forEach((e,n)=>{n>0&&n<=s&&(t.top=parseFloat(t.top)-a[--n].getBoundingClientRect().height-jsPanel.autopositionSpacing+"px");});break;case"right":a.forEach((e,n)=>{n>0&&n<=s&&(t.left=parseFloat(t.left)+a[--n].getBoundingClientRect().width+jsPanel.autopositionSpacing+"px");});break;case"left":a.forEach((e,n)=>{n>0&&n<=s&&(t.left=parseFloat(t.left)-a[--n].getBoundingClientRect().width-jsPanel.autopositionSpacing+"px");});}e.style.left=t.left,e.style.top=t.top;}return {left:t.left,top:t.top}},applyPositionOffset(e,t,n){["offsetX","offsetY"].forEach(e=>{n[e]?("function"==typeof n[e]&&(n[e]=n[e].call(t,t,n)),!1===isNaN(n[e])&&(n[e]=`${n[e]}px`)):n[e]="0px";}),e.style.left=`calc(${e.style.left} + ${n.offsetX})`,e.style.top=`calc(${e.style.top} + ${n.offsetY})`;const o=getComputedStyle(e);return {left:o.left,top:o.top}},applyPositionMinMax(e,t,n){if(["minLeft","minTop","maxLeft","maxTop"].forEach(e=>{n[e]&&("function"==typeof n[e]&&(n[e]=n[e].call(t,t,n)),(Number.isInteger(n[e])||n[e].match(/^\d+$/))&&(n[e]=`${n[e]}px`));}),n.minLeft){e.style.left=n.minLeft;let o=getComputedStyle(e).left;parseFloat(o)<parseFloat(t.left)?e.style.left=t.left:t.left=o;}if(n.minTop){e.style.top=n.minTop;let o=getComputedStyle(e).top;parseFloat(o)<parseFloat(t.top)?e.style.top=t.top:t.top=o;}if(n.maxLeft){e.style.left=n.maxLeft;let o=getComputedStyle(e).left;parseFloat(o)>parseFloat(t.left)?e.style.left=t.left:t.left=o;}if(n.maxTop){e.style.top=n.maxTop;let o=getComputedStyle(e).top;parseFloat(o)>parseFloat(t.top)?e.style.top=t.top:t.top=o;}const o=getComputedStyle(e);return {left:o.left,top:o.top}},applyPositionModify(e,t,n){if(n.modify&&"function"==typeof n.modify){const o=n.modify.call(t,t,n);e.style.left=Number.isInteger(o.left)||o.left.match(/^\d+$/)?`${o.left}px`:o.left,e.style.top=Number.isInteger(o.top)||o.top.match(/^\d+$/)?`${o.top}px`:o.top;}const o=getComputedStyle(e);return {left:o.left,top:o.top}},autopositionRemaining(e){let t,n=e.options.container;if(["left-top-down","left-top-right","center-top-down","right-top-down","right-top-left","left-bottom-up","left-bottom-right","center-bottom-up","right-bottom-up","right-bottom-left"].forEach(n=>{e.classList.contains(n)&&(t=n);}),t){("window"===n?document.body:"string"==typeof n?document.querySelector(n):n).querySelectorAll(`.${t}`).forEach(e=>{e.reposition();});}},addScript(e,t="text/javascript",n){if(!document.querySelector(`script[src="${e}"]`)){const o=document.createElement("script");n&&(o.onload=n),o.src=e,o.type=t,document.head.appendChild(o);}},ajax(obj,ajaxConfig){let objIsPanel;"object"==typeof obj&&obj.classList.contains("jsPanel")?objIsPanel=!0:(objIsPanel=!1,"string"==typeof obj&&(obj=document.querySelector(obj)));const configDefaults={method:"GET",async:!0,user:"",pwd:"",done:function(){objIsPanel?obj.content.innerHTML=this.responseText:obj.innerHTML=this.responseText;},autoresize:!0,autoreposition:!0};let config;if("string"==typeof ajaxConfig)config=Object.assign({},configDefaults,{url:encodeURI(ajaxConfig),evalscripttags:!0});else {if("object"!=typeof ajaxConfig||!ajaxConfig.url){if(this.errorReporting){let e="An XMLHttpRequest seems to miss the <mark>url</mark> parameter!";jsPanel.errorpanel(e);}return obj}config=Object.assign({},configDefaults,ajaxConfig),config.url=encodeURI(ajaxConfig.url),!1===config.async&&(config.timeout=0,config.withCredentials&&(config.withCredentials=void 0),config.responseType&&(config.responseType=void 0));}const xhr=new XMLHttpRequest;return xhr.onreadystatechange=(()=>{if(4===xhr.readyState){if(200===xhr.status){if(config.done.call(xhr,obj),config.evalscripttags){const scripttags=xhr.responseText.match(/<script\b[^>]*>([\s\S]*?)<\/script>/gi);scripttags&&scripttags.forEach(tag=>{const js=tag.replace(/<script\b[^>]*>/i,"").replace(/<\/script>/i,"").trim();eval(js);});}}else config.fail&&config.fail.call(xhr,obj);if(config.always&&config.always.call(xhr,obj),objIsPanel){const e=obj.options.contentSize;if("string"==typeof e&&e.match(/auto/i)){const t=e.split(" "),n=Object.assign({},{width:t[0],height:t[1]});config.autoresize&&obj.resize(n),obj.classList.contains("jsPanel-contextmenu")||config.autoreposition&&obj.reposition();}else if("object"==typeof e&&("auto"===e.width||"auto"===e.height)){const t=Object.assign({},e);config.autoresize&&obj.resize(t),obj.classList.contains("jsPanel-contextmenu")||config.autoreposition&&obj.reposition();}}jsPanel.ajaxAlwaysCallbacks.length&&jsPanel.ajaxAlwaysCallbacks.forEach(e=>{e.call(obj,obj);});}}),xhr.open(config.method,config.url,config.async,config.user,config.pwd),xhr.timeout=config.timeout||0,config.withCredentials&&(xhr.withCredentials=config.withCredentials),config.responseType&&(xhr.responseType=config.responseType),config.beforeSend&&config.beforeSend.call(xhr),config.data?xhr.send(config.data):xhr.send(null),obj},createPanelTemplate(e=!0){const t=document.createElement("div");return t.className="jsPanel",t.style.left="0",t.style.top="0",e&&["close","maximize","normalize","minimize","smallify"].forEach(e=>{t.setAttribute(`data-btn${e}`,"enabled");}),t.innerHTML=`<div class="jsPanel-hdr">\n                                <div class="jsPanel-headerbar">\n                                    <div class="jsPanel-headerlogo"></div>\n                                    <div class="jsPanel-titlebar">\n                                        <span class="jsPanel-title"></span>\n                                    </div>\n                                    <div class="jsPanel-controlbar">\n                                        <button type="button" class="jsPanel-btn jsPanel-btn-smallify"  aria-label="Smallify">${this.icons.smallify}</button>\n                                        <button type="button" class="jsPanel-btn jsPanel-btn-minimize"  aria-label="Minimize">${this.icons.minimize}</button>\n                                        <button type="button" class="jsPanel-btn jsPanel-btn-normalize" aria-label="Normalize">${this.icons.normalize}</button>\n                                        <button type="button" class="jsPanel-btn jsPanel-btn-maximize"  aria-label="Maximize">${this.icons.maximize}</button>\n                                        <button type="button" class="jsPanel-btn jsPanel-btn-close"     aria-label="Close">${this.icons.close}</button>\n                                    </div>\n                                </div>\n                                <div class="jsPanel-hdr-toolbar"></div>\n                            </div>\n                            <div class="jsPanel-autoclose-progressbar">\n                                <div class="jsPanel-autoclose-progressbar-slider"></div>\n                            </div>\n                            <div class="jsPanel-content"></div>\n                            <div class="jsPanel-minimized-box"></div>\n                            <div class="jsPanel-ftr"></div>`,t},createMinimizedTemplate(){const e=document.createElement("div");return e.className="jsPanel-replacement",e.innerHTML=`<div class="jsPanel-hdr">\n                                <div class="jsPanel-headerbar">\n                                    <div class="jsPanel-headerlogo"></div>\n                                    <div class="jsPanel-titlebar">\n                                        <span class="jsPanel-title"></span>\n                                    </div>\n                                    <div class="jsPanel-controlbar">\n                                        <button type="button" class="jsPanel-btn jsPanel-btn-sm jsPanel-btn-normalize" aria-label="Normalize">${this.icons.normalize}</button>\n                                        <button type="button" class="jsPanel-btn jsPanel-btn-sm jsPanel-btn-maximize"  aria-label="Maximize">${this.icons.maximize}</button>\n                                        <button type="button" class="jsPanel-btn jsPanel-btn-sm jsPanel-btn-close"     aria-label="Close">${this.icons.close}</button>\n                                    </div>\n                                </div>\n                            </div>`,e},createSnapArea(e,t,n){const o=document.createElement("div"),a=e.parentElement;o.className=`jsPanel-snap-area jsPanel-snap-area-${t}`,"lt"===t||"rt"===t||"rb"===t||"lb"===t?(o.style.width=n+"px",o.style.height=n+"px"):"ct"===t||"cb"===t?o.style.height=n+"px":"lc"!==t&&"rc"!==t||(o.style.width=n+"px"),a!==document.body&&(o.style.position="absolute"),document.querySelector(`.jsPanel-snap-area.jsPanel-snap-area-${t}`)||e.parentElement.appendChild(o);},dragit(e,t={}){let n,o,a;const s=new CustomEvent("jspaneldragstart",{detail:e.id}),l=new CustomEvent("jspaneldrag",{detail:e.id}),i=new CustomEvent("jspaneldragstop",{detail:e.id});[s,l,i].forEach(t=>{t.panel=e;});const r=e=>{let t=e.split("-");return t.forEach((e,n)=>{t[n]=e.charAt(0).toUpperCase()+e.slice(1);}),"snap"+t.join("")};function c(t){null===t.relatedTarget&&jsPanel.pointermove.forEach(t=>{document.removeEventListener(t,o,!1),e.style.opacity=1;});}let d=t.handles||this.defaults.dragit.handles,p=t.cursor||this.defaults.dragit.cursor;return e.querySelectorAll(d).forEach(d=>{d.style.touchAction="none",d.style.cursor=p,jsPanel.pointerdown.forEach(i=>{d.addEventListener(i,i=>{if(i.button&&i.button>0)return !1;if((a=Object.assign({},jsPanel.defaults.dragit,t)).disableOnMaximized&&"maximized"===e.status)return !1;if((a.containment||0===a.containment)&&(a.containment=jsPanel.pOcontainment(a.containment)),a.grid&&Array.isArray(a.grid)&&1===a.grid.length&&(a.grid[1]=a.grid[0]),a.snap&&("object"==typeof a.snap?a.snap=Object.assign({},jsPanel.defaultSnapConfig,a.snap):a.snap=jsPanel.defaultSnapConfig),i.target.closest(".jsPanel-ftr-btn"))return;e.controlbar.style.pointerEvents="none",e.content.style.pointerEvents="none",document.querySelectorAll("iframe").forEach(e=>{e.style.pointerEvents="none";});let r=window.getComputedStyle(e),d=parseFloat(r.left),p=parseFloat(r.top),h=parseFloat(r.width),f=parseFloat(r.height),m=i.touches?i.touches[0].clientX:i.clientX,u=i.touches?i.touches[0].clientY:i.clientY,g=e.parentElement,b=g.getBoundingClientRect(),y=window.getComputedStyle(g),j=e.getScaleFactor(),w=0;o=(t=>{if(t.preventDefault(),!n){if(document.dispatchEvent(s),e.style.opacity=a.opacity,e.snapped&&a.snap.resizeToPreSnap&&e.currentData.beforeSnap){e.resize(e.currentData.beforeSnap.width+" "+e.currentData.beforeSnap.height),e.setControls([".jsPanel-btn-normalize"]);let t=e.getBoundingClientRect(),n=m-(t.left+t.width),o=t.width/2;n>-o&&(w=n+o);}if(e.front(),e.snapped=!1,"maximized"===e.status&&(e.setControls([".jsPanel-btn-normalize"]),e.status="normalized"),a.drop&&a.drop.dropZones){let e=a.drop.dropZones.map(e=>jsPanel.pOcontainer(e)),t=[];e.forEach(function(e){e.length?e.forEach(function(e){t.push(e);}):t.push(e);}),t=t.filter(function(e,t,n){return n.indexOf(e)===t}),a.drop.dropZones=t;}a.start.length&&jsPanel.processCallbacks(e,a.start,!1,{left:d,top:p,width:h,height:f},t);}let o,i,r,c,v,x,P,E,C,F;n=1;let z,S=t.touches?t.touches[0].clientX:t.clientX,A=t.touches?t.touches[0].clientY:t.clientY,k=window.getComputedStyle(e);if(g===document.body){let t=e.getBoundingClientRect();C=window.innerWidth-parseInt(y.borderLeftWidth,10)-parseInt(y.borderRightWidth,10)-(t.left+t.width),F=window.innerHeight-parseInt(y.borderTopWidth,10)-parseInt(y.borderBottomWidth,10)-(t.top+t.height);}else C=parseInt(y.width,10)-parseInt(y.borderLeftWidth,10)-parseInt(y.borderRightWidth,10)-(parseInt(k.left,10)+parseInt(k.width,10)),F=parseInt(y.height,10)-parseInt(y.borderTopWidth,10)-parseInt(y.borderBottomWidth,10)-(parseInt(k.top,10)+parseInt(k.height,10));o=parseFloat(k.left),r=parseFloat(k.top),v=C,P=F,a.snap&&("panel"===a.snap.trigger?(i=o**2,c=r**2,x=v**2,E=P**2):"pointer"===a.snap.trigger&&("window"===e.options.container?(o=S,i=S**2,c=(r=A)**2,x=(v=window.innerWidth-S)**2,E=(P=window.innerHeight-A)**2):(o=(z=e.overlaps(g,"paddingbox",t)).pointer.left,r=z.pointer.top,v=z.pointer.right,P=z.pointer.bottom,i=z.pointer.left**2,c=z.pointer.top**2,x=z.pointer.right**2,E=z.pointer.bottom**2)));let B=Math.sqrt(i+c),T=Math.sqrt(i+E),L=Math.sqrt(x+c),R=Math.sqrt(x+E),D=Math.abs(o-v)/2,W=Math.abs(r-P)/2,$=Math.sqrt(i+W**2),q=Math.sqrt(c+D**2),O=Math.sqrt(x+W**2),I=Math.sqrt(E+D**2);if(window.getSelection().removeAllRanges(),document.dispatchEvent(l),a.axis&&"x"!==a.axis||(e.style.left=d+(S-m)/j.x+w+"px"),a.axis&&"y"!==a.axis||(e.style.top=p+(A-u)/j.y+"px"),a.grid){let t=a.grid,n=a.axis,o=t[0]*Math.round((d+(S-m))/t[0]),s=t[1]*Math.round((p+(A-u))/t[1]);n&&"x"!==n||(e.style.left=`${o}px`),n&&"y"!==n||(e.style.top=`${s}px`);}if(a.containment||0===a.containment){let t,n,o=a.containment;if(e.options.container===document.body)t=window.innerWidth-parseFloat(k.width)-o[1],n=window.innerHeight-parseFloat(k.height)-o[2];else {let e=parseFloat(y.borderLeftWidth)+parseFloat(y.borderRightWidth),a=parseFloat(y.borderTopWidth)+parseFloat(y.borderBottomWidth);t=b.width/j.x-parseFloat(k.width)-o[1]-e,n=b.height/j.y-parseFloat(k.height)-o[2]-a;}parseFloat(e.style.left)<=o[3]&&(e.style.left=o[3]+"px"),parseFloat(e.style.top)<=o[0]&&(e.style.top=o[0]+"px"),parseFloat(e.style.left)>=t&&(e.style.left=t+"px"),parseFloat(e.style.top)>=n&&(e.style.top=n+"px");}if(a.drag.length){let n={left:o,top:r,right:v,bottom:P,width:parseFloat(k.width),height:parseFloat(k.height)};jsPanel.processCallbacks(e,a.drag,!1,n,t);}if(a.snap){let t=a.snap.sensitivity,n=g===document.body?window.innerWidth/8:b.width/8,s=g===document.body?window.innerHeight/8:b.height/8;e.snappableTo=!1,jsPanel.removeSnapAreas(),B<t?!1!==a.snap.snapLeftTop&&(a.snap.active&&"both"!==a.snap.active?"pointer"===a.snap.trigger&&a.snap.active&&"inside"===a.snap.active&&(z.pointer.left>0&&z.pointer.top>0?(e.snappableTo="left-top",jsPanel.createSnapArea(e,"lt",t)):(e.snappableTo=!1,jsPanel.removeSnapAreas())):(e.snappableTo="left-top",jsPanel.createSnapArea(e,"lt",t))):T<t?!1!==a.snap.snapLeftBottom&&(a.snap.active&&"both"!==a.snap.active?"pointer"===a.snap.trigger&&a.snap.active&&"inside"===a.snap.active&&(z.pointer.left>0&&z.pointer.bottom>0?(e.snappableTo="left-bottom",jsPanel.createSnapArea(e,"lb",t)):(e.snappableTo=!1,jsPanel.removeSnapAreas())):(e.snappableTo="left-bottom",jsPanel.createSnapArea(e,"lb",t))):L<t?!1!==a.snap.snapRightTop&&(a.snap.active&&"both"!==a.snap.active?"pointer"===a.snap.trigger&&a.snap.active&&"inside"===a.snap.active&&(z.pointer.right>0&&z.pointer.top>0?(e.snappableTo="right-top",jsPanel.createSnapArea(e,"rt",t)):(e.snappableTo=!1,jsPanel.removeSnapAreas())):(e.snappableTo="right-top",jsPanel.createSnapArea(e,"rt",t))):R<t?!1!==a.snap.snapRightBottom&&(a.snap.active&&"both"!==a.snap.active?"pointer"===a.snap.trigger&&a.snap.active&&"inside"===a.snap.active&&(z.pointer.right>0&&z.pointer.bottom>0?(e.snappableTo="right-bottom",jsPanel.createSnapArea(e,"rb",t)):(e.snappableTo=!1,jsPanel.removeSnapAreas())):(e.snappableTo="right-bottom",jsPanel.createSnapArea(e,"rb",t))):r<t&&q<n?!1!==a.snap.snapCenterTop&&(a.snap.active&&"both"!==a.snap.active?"pointer"===a.snap.trigger&&a.snap.active&&"inside"===a.snap.active&&(z.pointer.top>0?(e.snappableTo="center-top",jsPanel.createSnapArea(e,"ct",t)):(e.snappableTo=!1,jsPanel.removeSnapAreas())):(e.snappableTo="center-top",jsPanel.createSnapArea(e,"ct",t))):o<t&&$<s?!1!==a.snap.snapLeftCenter&&(a.snap.active&&"both"!==a.snap.active?"pointer"===a.snap.trigger&&a.snap.active&&"inside"===a.snap.active&&(z.pointer.left>0?(e.snappableTo="left-center",jsPanel.createSnapArea(e,"lc",t)):(e.snappableTo=!1,jsPanel.removeSnapAreas())):(e.snappableTo="left-center",jsPanel.createSnapArea(e,"lc",t))):v<t&&O<s?!1!==a.snap.snapRightCenter&&(a.snap.active&&"both"!==a.snap.active?"pointer"===a.snap.trigger&&a.snap.active&&"inside"===a.snap.active&&(z.pointer.right>0?(e.snappableTo="right-center",jsPanel.createSnapArea(e,"rc",t)):(e.snappableTo=!1,jsPanel.removeSnapAreas())):(e.snappableTo="right-center",jsPanel.createSnapArea(e,"rc",t))):P<t&&I<n&&!1!==a.snap.snapCenterBottom&&(a.snap.active&&"both"!==a.snap.active?"pointer"===a.snap.trigger&&a.snap.active&&"inside"===a.snap.active&&(z.pointer.bottom>0?(e.snappableTo="center-bottom",jsPanel.createSnapArea(e,"cb",t)):(e.snappableTo=!1,jsPanel.removeSnapAreas())):(e.snappableTo="center-bottom",jsPanel.createSnapArea(e,"cb",t)));}if(a.drop&&a.drop.dropZones){let n=jsPanel.isIE?"msElementsFromPoint":"elementsFromPoint",o=document[n](t.clientX,t.clientY);Array.isArray(o)||(o=Array.prototype.slice.call(o)),a.drop.dropZones.forEach(t=>{o.includes(t)&&(e.droppableTo=t);}),o.includes(e.droppableTo)||(e.droppableTo=!1);}}),jsPanel.pointermove.forEach(e=>{document.addEventListener(e,o);}),window.addEventListener("mouseout",c,!1);});}),jsPanel.pointerup.forEach(t=>{document.addEventListener(t,t=>{if(jsPanel.pointermove.forEach(e=>{document.removeEventListener(e,o);}),jsPanel.removeSnapAreas(),n){if(e.style.opacity=1,n=void 0,a.snap){switch(e.snappableTo){case"left-top":e.snap(a.snap.snapLeftTop);break;case"center-top":e.snap(a.snap.snapCenterTop);break;case"right-top":e.snap(a.snap.snapRightTop);break;case"right-center":e.snap(a.snap.snapRightCenter);break;case"right-bottom":e.snap(a.snap.snapRightBottom);break;case"center-bottom":e.snap(a.snap.snapCenterBottom);break;case"left-bottom":e.snap(a.snap.snapLeftBottom);break;case"left-center":e.snap(a.snap.snapLeftCenter);}a.snap.callback&&e.snappableTo&&"function"==typeof a.snap.callback&&(a.snap.callback.call(e,e),a.snap.repositionOnSnap&&!1!==a.snap[r(e.snappableTo)]&&e.repositionOnSnap(e.snappableTo)),e.snappableTo&&a.snap.repositionOnSnap&&a.snap[r(e.snappableTo)]&&e.repositionOnSnap(e.snappableTo);}if(e.droppableTo&&e.droppableTo!==e.parentElement){let t=e.parentElement;e.move(e.droppableTo),a.drop.callback&&a.drop.callback.call(e,e,e.droppableTo,t);}if(document.dispatchEvent(i),a.stop.length){let n=window.getComputedStyle(e),o={left:parseFloat(n.left),top:parseFloat(n.top),width:parseFloat(n.width),height:parseFloat(n.height)};jsPanel.processCallbacks(e,a.stop,!1,o,t);}e.saveCurrentPosition(),e.calcSizeFactors();}e.controlbar.style.pointerEvents="inherit",e.content.style.pointerEvents="inherit",document.querySelectorAll("iframe").forEach(e=>{e.style.pointerEvents="auto";});}),window.removeEventListener("mouseout",c);}),t.disable&&(d.style.pointerEvents="none");}),e},emptyNode(e){for(;e.firstChild;)e.removeChild(e.firstChild);return e},extend(e){if("[object Object]"===Object.prototype.toString.call(e))for(let t in e)Object.prototype.hasOwnProperty.call(e,t)&&(this.extensions[t]=e[t]);},fetch(obj){const confDefaults={bodyMethod:"text",evalscripttags:!0,autoresize:!0,autoreposition:!0,done:(e,t)=>{e.content.innerHTML=t;}},conf="string"==typeof obj.options.contentFetch?Object.assign({resource:obj.options.contentFetch},confDefaults):Object.assign(confDefaults,obj.options.contentFetch),fetchInit=conf.fetchInit||{};if(!conf.resource){if(this.errorReporting){let e="A Fetch request seems to miss the <mark>resource</mark> parameter";jsPanel.errorpanel(e);}return obj}conf.beforeSend&&conf.beforeSend.call(obj,obj),fetch(conf.resource,fetchInit).then(e=>{if(e.ok)return e[conf.bodyMethod]()}).then(response=>{if(conf.done.call(obj,obj,response),conf.evalscripttags){const scripttags=response.match(/<script\b[^>]*>([\s\S]*?)<\/script>/gi);scripttags&&scripttags.forEach(tag=>{let js=tag.replace(/<script\b[^>]*>/i,"").replace(/<\/script>/i,"").trim();eval(js);});}const oContentSize=obj.options.contentSize;if(conf.autoresize||conf.autoreposition)if("string"==typeof oContentSize&&oContentSize.match(/auto/i)){const e=oContentSize.split(" "),t=Object.assign({},{width:e[0],height:e[1]});conf.autoresize&&obj.resize(t),obj.classList.contains("jsPanel-contextmenu")||conf.autoreposition&&obj.reposition();}else if("object"==typeof oContentSize&&("auto"===oContentSize.width||"auto"===oContentSize.height)){const e=Object.assign({},oContentSize);conf.autoresize&&obj.resize(e),obj.classList.contains("jsPanel-contextmenu")||conf.autoreposition&&obj.reposition();}});},getPanels:(e=function(){return this.classList.contains("jsPanel-standard")})=>Array.prototype.slice.call(document.querySelectorAll(".jsPanel")).filter(t=>e.call(t,t)).sort((e,t)=>t.style.zIndex-e.style.zIndex),pOcontainer(e){if("window"===e)return document.body;if("string"==typeof e){let t=document.querySelectorAll(e);return !!(t.length&&t.length>0)&&t}return 1===e.nodeType?e:!!e.length&&e[0]},pOcontainment(e){let t=e;if("function"==typeof e&&(t=e()),"number"==typeof t)return [t,t,t,t];if(Array.isArray(t)){if(1===t.length)return [t[0],t[0],t[0],t[0]];if(2===t.length)return t.concat(t);3===t.length&&(t[3]=t[1]);}return t},pOsize(e,t){let n=t||this.defaults.contentSize;const o=e.parentElement;if("string"==typeof n){const e=n.trim().split(" ");(n={}).width=e[0],2===e.length?n.height=e[1]:n.height=e[0];}else n.width&&!n.height?n.height=n.width:n.height&&!n.width&&(n.width=n.height);if(String(n.width).match(/^[0-9.]+$/gi))n.width+="px";else if("string"==typeof n.width&&n.width.endsWith("%"))if(o===document.body)n.width=window.innerWidth*(parseFloat(n.width)/100)+"px";else {const e=window.getComputedStyle(o),t=parseFloat(e.borderLeftWidth)+parseFloat(e.borderRightWidth);n.width=(parseFloat(e.width)-t)*(parseFloat(n.width)/100)+"px";}else "function"==typeof n.width&&(n.width=n.width.call(e,e),"number"==typeof n.width?n.width+="px":"string"==typeof n.width&&n.width.match(/^[0-9.]+$/gi)&&(n.width+="px"));if(String(n.height).match(/^[0-9.]+$/gi))n.height+="px";else if("string"==typeof n.height&&n.height.endsWith("%"))if(o===document.body)n.height=window.innerHeight*(parseFloat(n.height)/100)+"px";else {const e=window.getComputedStyle(o),t=parseFloat(e.borderTopWidth)+parseFloat(e.borderBottomWidth);n.height=(parseFloat(e.height)-t)*(parseFloat(n.height)/100)+"px";}else "function"==typeof n.height&&(n.height=n.height.call(e,e),"number"==typeof n.height?n.height+="px":"string"==typeof n.height&&n.height.match(/^[0-9.]+$/gi)&&(n.height+="px"));return n},pOborder(e){e=e.trim();const t=new Array(3),n=e.match(/\s*(none|hidden|dotted|dashed|solid|double|groove|ridge|inset|outset)\s*/gi),o=e.match(/\s*(thin|medium|thick)|(\d*\.?\d+[a-zA-Z]{2,4})\s*/gi);return n?(t[1]=n[0].trim(),e=e.replace(t[1],"")):t[1]="solid",o?(t[0]=o[0].trim(),e=e.replace(t[0],"")):t[0]="medium",t[2]=e.trim(),t},pOheaderControls(e){if("string"==typeof e){let t={},n=e.toLowerCase(),o=n.match(/xl|lg|md|sm|xs/),a=n.match(/closeonly|none/);return o&&(t.size=o[0]),a&&(t=Object.assign({},t,{maximize:"remove",normalize:"remove",minimize:"remove",smallify:"remove"}),"none"===a[0]&&(t.close="remove")),Object.assign({},this.defaults.headerControls,t)}return Object.assign({},this.defaults.headerControls,e)},processCallbacks(e,t,n="some",o,a){if("function"==typeof t&&(t=[t]),n)return t[n](t=>t.call(e,e,o,a));t.forEach(t=>{t.call(e,e,o,a);});},removeSnapAreas(){document.querySelectorAll(".jsPanel-snap-area").forEach(e=>{e.parentElement.removeChild(e);});},resetZi(){this.zi=((e=jsPanel.ziBase)=>{let t=e;return {next:()=>t++}})(),Array.prototype.slice.call(document.querySelectorAll(".jsPanel-standard")).sort((e,t)=>e.style.zIndex-t.style.zIndex).forEach(e=>{e.style.zIndex=jsPanel.zi.next();});},resizeit(e,t={}){const n=new CustomEvent("jspanelresizestart",{detail:e.id}),o=new CustomEvent("jspanelresize",{detail:e.id}),a=new CustomEvent("jspanelresizestop",{detail:e.id});[n,o,a].forEach(t=>{t.panel=e;});let s,l,i,r,c,d,p={};p.handles=t.handles||jsPanel.defaults.resizeit.handles,p.handles.split(",").forEach(t=>{const n=document.createElement("DIV");n.className=`jsPanel-resizeit-handle jsPanel-resizeit-${t.trim()}`,e.append(n);});let h=!!t.aspectRatio&&t.aspectRatio;function f(e){null===e.relatedTarget&&jsPanel.pointermove.forEach(e=>{document.removeEventListener(e,s,!1);});}return e.querySelectorAll(".jsPanel-resizeit-handle").forEach(m=>{m.style.touchAction="none",jsPanel.pointerdown.forEach(a=>{m.addEventListener(a,a=>{if(a.button&&a.button>0)return !1;let h=1;if(((p=Object.assign({},jsPanel.defaults.resizeit,t)).containment||0===p.containment)&&(p.containment=jsPanel.pOcontainment(p.containment)),p.aspectRatio&&!0===p.aspectRatio&&(p.aspectRatio="panel"),jsPanel.modifier){let e=jsPanel.modifier;e.altKey?p.aspectRatio="content":e.ctrlKey?p.aspectRatio="panel":e.shiftKey&&(p.aspectRatio=!1,h=2);}let m="function"==typeof p.maxWidth?p.maxWidth():p.maxWidth||1e4,u="function"==typeof p.maxHeight?p.maxHeight():p.maxHeight||1e4,g="function"==typeof p.minWidth?p.minWidth():p.minWidth,b="function"==typeof p.minHeight?p.minHeight():p.minHeight;e.content.style.pointerEvents="none",document.querySelectorAll("iframe").forEach(e=>{e.style.pointerEvents="none";});const y=e.parentElement,j=y.tagName.toLowerCase(),w=e.getBoundingClientRect(),v=y.getBoundingClientRect(),x=window.getComputedStyle(y,null),P=parseInt(x.borderLeftWidth,10),E=parseInt(x.borderTopWidth,10),C=x.getPropertyValue("position"),F=a.clientX||a.touches[0].clientX,z=a.clientY||a.touches[0].clientY,S=F/z,A=a.target.classList,k=e.getScaleFactor(),B=w.width/w.height,T=e.content.getBoundingClientRect(),L=T.width/T.height,R=e.header.getBoundingClientRect().height,D=e.footer.getBoundingClientRect().height||0;let W=w.left,$=w.top,q=1e4,O=1e4,I=1e4,M=1e4;c=w.width,d=w.height,"body"!==j&&(W=w.left-v.left+y.scrollLeft,$=w.top-v.top+y.scrollTop),"body"===j&&p.containment?(q=document.documentElement.clientWidth-w.left,I=document.documentElement.clientHeight-w.top,O=w.width+w.left,M=w.height+w.top):p.containment&&("static"===C?(q=v.width-w.left+P,I=v.height+v.top-w.top+E,O=w.width+(w.left-v.left)-P,M=w.height+(w.top-v.top)-E):(q=y.clientWidth-(w.left-v.left)/k.x+P,I=y.clientHeight-(w.top-v.top)/k.y+E,O=(w.width+w.left-v.left)/k.x-P,M=e.clientHeight+(w.top-v.top)/k.y-E)),p.containment&&(O-=p.containment[3],M-=p.containment[0],q-=p.containment[1],I-=p.containment[2]);const N=window.getComputedStyle(e),H=parseFloat(N.width)-w.width,X=parseFloat(N.height)-w.height;let Y=parseFloat(N.left)-w.left,V=parseFloat(N.top)-w.top;y!==document.body&&(Y+=v.left,V+=v.top);let Z=parseInt(N.borderTopWidth,10),U=parseInt(N.borderRightWidth,10),K=parseInt(N.borderBottomWidth,10),_=parseInt(N.borderLeftWidth,10);s=(t=>{t.preventDefault(),l||(document.dispatchEvent(n),p.start.length&&jsPanel.processCallbacks(e,p.start,!1,{width:c,height:d,left:W,top:$},t),e.front(),w.height>d+5&&(e.status="normalized",e.setControls([".jsPanel-btn-normalize"]))),l=1,document.dispatchEvent(o);let a,s=t.touches?t.touches[0].clientX:t.clientX,f=t.touches?t.touches[0].clientY:t.clientY;A.contains("jsPanel-resizeit-e")?((i=c+(s-F)*h/k.x+H)>=q&&(i=q),i>=m&&(i=m),i<=g&&(i=g),e.style.width=i+"px",2===h&&(e.style.left=W-(s-F)+"px"),"content"===p.aspectRatio?(e.style.height=(i-U-_)/L+R+D+Z+K+"px",p.containment&&(a=e.overlaps(y)).bottom<=p.containment[2]&&(e.style.height=I+"px",e.style.width=I*L+"px")):"panel"===p.aspectRatio&&(e.style.height=i/B+"px",p.containment&&(a=e.overlaps(y)).bottom<=p.containment[2]&&(e.style.height=I+"px",e.style.width=I*B+"px"))):A.contains("jsPanel-resizeit-s")?((r=d+(f-z)*h/k.y+X)>=I&&(r=I),r>=u&&(r=u),r<=b&&(r=b),e.style.height=r+"px",2===h&&(e.style.top=$-(f-z)+"px"),"content"===p.aspectRatio?(e.style.width=(r-R-D-Z-K)*L+Z+K+"px",p.containment&&(a=e.overlaps(y)).right<=p.containment[1]&&(e.style.width=q+"px",e.style.height=q/L+"px")):"panel"===p.aspectRatio&&(e.style.width=r*B+"px",p.containment&&(a=e.overlaps(y)).right<=p.containment[1]&&(e.style.width=q+"px",e.style.height=q/B+"px"))):A.contains("jsPanel-resizeit-w")?((i=c+(F-s)*h/k.x+H)<=m&&i>=g&&i<=O&&(e.style.left=W+(s-F)/k.x+Y+"px"),i>=O&&(i=O),i>=m&&(i=m),i<=g&&(i=g),e.style.width=i+"px","content"===p.aspectRatio?(e.style.height=(i-U-_)/L+R+D+Z+K+"px",p.containment&&(a=e.overlaps(y)).bottom<=p.containment[2]&&(e.style.height=I+"px",e.style.width=I*L+"px")):"panel"===p.aspectRatio&&(e.style.height=i/B+"px",p.containment&&(a=e.overlaps(y)).bottom<=p.containment[2]&&(e.style.height=I+"px",e.style.width=I*B+"px"))):A.contains("jsPanel-resizeit-n")?((r=d+(z-f)*h/k.y+X)<=u&&r>=b&&r<=M&&(e.style.top=$+(f-z)/k.y+V+"px"),r>=M&&(r=M),r>=u&&(r=u),r<=b&&(r=b),e.style.height=r+"px","content"===p.aspectRatio?(e.style.width=(r-R-D-Z-K)*L+Z+K+"px",p.containment&&(a=e.overlaps(y)).right<=p.containment[1]&&(e.style.width=q+"px",e.style.height=q/L+"px")):"panel"===p.aspectRatio&&(e.style.width=r*B+"px",p.containment&&(a=e.overlaps(y)).right<=p.containment[1]&&(e.style.width=q+"px",e.style.height=q/B+"px"))):A.contains("jsPanel-resizeit-se")?((i=c+(s-F)*h/k.x+H)>=q&&(i=q),i>=m&&(i=m),i<=g&&(i=g),e.style.width=i+"px",2===h&&(e.style.left=W-(s-F)+"px"),p.aspectRatio&&(e.style.height=i/B+"px"),(r=d+(f-z)*h/k.y+X)>=I&&(r=I),r>=u&&(r=u),r<=b&&(r=b),e.style.height=r+"px",2===h&&(e.style.top=$-(f-z)+"px"),"content"===p.aspectRatio?(e.style.width=(r-R-D-Z-K)*L+Z+K+"px",p.containment&&(a=e.overlaps(y)).right<=p.containment[1]&&(e.style.width=q+"px",e.style.height=q/L+"px")):"panel"===p.aspectRatio&&(e.style.width=r*B+"px",p.containment&&(a=e.overlaps(y)).right<=p.containment[1]&&(e.style.width=q+"px",e.style.height=q/B+"px"))):A.contains("jsPanel-resizeit-sw")?((r=d+(f-z)*h/k.y+X)>=I&&(r=I),r>=u&&(r=u),r<=b&&(r=b),e.style.height=r+"px",2===h&&(e.style.top=$-(f-z)+"px"),p.aspectRatio&&(e.style.width=r*B+"px"),(i=c+(F-s)*h/k.x+H)<=m&&i>=g&&i<=O&&(e.style.left=W+(s-F)/k.x+Y+"px"),i>=O&&(i=O),i>=m&&(i=m),i<=g&&(i=g),e.style.width=i+"px","content"===p.aspectRatio?(e.style.height=(i-U-_)/L+R+D+Z+K+"px",p.containment&&(a=e.overlaps(y)).bottom<=p.containment[2]&&(e.style.height=I+"px",e.style.width=I*L+"px")):"panel"===p.aspectRatio&&(e.style.height=i/B+"px",p.containment&&(a=e.overlaps(y)).bottom<=p.containment[2]&&(e.style.height=I+"px",e.style.width=I*B+"px"))):A.contains("jsPanel-resizeit-ne")?((i=c+(s-F)*h/k.x+H)>=q&&(i=q),i>=m&&(i=m),i<=g&&(i=g),e.style.width=i+"px",2===h&&(e.style.left=W-(s-F)+"px"),p.aspectRatio&&(e.style.height=i/B+"px"),(r=d+(z-f)*h/k.y+X)<=u&&r>=b&&r<=M&&(e.style.top=$+(f-z)/k.y+V+"px"),r>=M&&(r=M),r>=u&&(r=u),r<=b&&(r=b),e.style.height=r+"px","content"===p.aspectRatio?(e.style.width=(r-R-D-Z-K)*L+Z+K+"px",p.containment&&(a=e.overlaps(y)).right<=p.containment[1]&&(e.style.width=q+"px",e.style.height=q/L+"px")):"panel"===p.aspectRatio&&(e.style.width=r*B+"px",p.containment&&(a=e.overlaps(y)).right<=p.containment[1]&&(e.style.width=q+"px",e.style.height=q/B+"px"))):A.contains("jsPanel-resizeit-nw")&&(p.aspectRatio&&A.contains("jsPanel-resizeit-nw")&&(f=(s=f*S)/S),(i=c+(F-s)*h/k.x+H)<=m&&i>=g&&i<=O&&(e.style.left=W+(s-F)/k.x+Y+"px"),i>=O&&(i=O),i>=m&&(i=m),i<=g&&(i=g),e.style.width=i+"px",p.aspectRatio&&(e.style.height=i/B+"px"),(r=d+(z-f)*h/k.y+X)<=u&&r>=b&&r<=M&&(e.style.top=$+(f-z)/k.y+V+"px"),r>=M&&(r=M),r>=u&&(r=u),r<=b&&(r=b),e.style.height=r+"px","content"===p.aspectRatio?e.style.width=(r-R-D-Z-K)*L+Z+K+"px":"panel"===p.aspectRatio&&(e.style.width=r*B+"px")),window.getSelection().removeAllRanges();const j=window.getComputedStyle(e),v={left:parseFloat(j.left),top:parseFloat(j.top),right:parseFloat(j.right),bottom:parseFloat(j.bottom),width:parseFloat(j.width),height:parseFloat(j.height)};p.resize.length&&jsPanel.processCallbacks(e,p.resize,!1,v,t);}),jsPanel.pointermove.forEach(e=>{document.addEventListener(e,s,!1);}),window.addEventListener("mouseout",f,!1);});}),jsPanel.pointerup.forEach(function(t){document.addEventListener(t,t=>{if(jsPanel.pointermove.forEach(e=>{document.removeEventListener(e,s,!1);}),t.target.classList&&t.target.classList.contains("jsPanel-resizeit-handle")){let n,o,a=t.target.className;if(a.match(/jsPanel-resizeit-nw|jsPanel-resizeit-w|jsPanel-resizeit-sw/i)&&(n=!0),a.match(/jsPanel-resizeit-nw|jsPanel-resizeit-n|jsPanel-resizeit-ne/i)&&(o=!0),p.grid&&Array.isArray(p.grid)){1===p.grid.length&&(p.grid[1]=p.grid[0]);const t=parseFloat(e.style.width),a=parseFloat(e.style.height),s=t%p.grid[0],l=a%p.grid[1],i=parseFloat(e.style.left),r=parseFloat(e.style.top),c=i%p.grid[0],d=r%p.grid[1];s<p.grid[0]/2?e.style.width=t-s+"px":e.style.width=t+(p.grid[0]-s)+"px",l<p.grid[1]/2?e.style.height=a-l+"px":e.style.height=a+(p.grid[1]-l)+"px",n&&(c<p.grid[0]/2?e.style.left=i-c+"px":e.style.left=i+(p.grid[0]-c)+"px"),o&&(d<p.grid[1]/2?e.style.top=r-d+"px":e.style.top=r+(p.grid[1]-d)+"px");}}if(l){e.content.style.pointerEvents="inherit",l=void 0,e.saveCurrentDimensions(),e.saveCurrentPosition(),e.calcSizeFactors();let n=e.controlbar.querySelector(".jsPanel-btn-smallify"),o=e.getBoundingClientRect();if(n&&o.height>d+5&&(n.style.transform="rotate(0deg)"),document.dispatchEvent(a),p.stop.length){let n=window.getComputedStyle(e),o={left:parseFloat(n.left),top:parseFloat(n.top),width:parseFloat(n.width),height:parseFloat(n.height)};jsPanel.processCallbacks(e,p.stop,!1,o,t);}}e.content.style.pointerEvents="inherit",document.querySelectorAll("iframe").forEach(e=>{e.style.pointerEvents="auto";}),p.aspectRatio=h;},!1),window.removeEventListener("mouseout",f);}),t.disable&&(m.style.pointerEvents="none");}),e},setClass:(e,t)=>(t.trim().split(/\s+/).forEach(t=>e.classList.add(t)),e),remClass:(e,t)=>(t.trim().split(/\s+/).forEach(t=>e.classList.remove(t)),e),toggleClass:(e,t)=>(t.trim().split(/\s+/).forEach(t=>{e.classList.contains(t)?e.classList.remove(t):e.classList.add(t);}),e),setStyles(e,t){for(let n in t)n in e.style?e.style[n]=t[n]:e.style.setProperty(n,t[n]);return e},setStyle(e,t){return this.setStyles.call(e,e,t)},errorpanel(e){this.create({paneltype:"error",dragit:!1,resizeit:!1,theme:{bgPanel:"white",bgContent:"white",colorHeader:"rebeccapurple",colorContent:"#333",border:"2px solid rebeccapurple"},borderRadius:".33rem",headerControls:"closeonly xs",headerTitle:"&#9888; jsPanel Error",contentSize:{width:"50%",height:"auto"},position:"center-top 0 5 down",animateIn:"jsPanelFadeIn",content:`<div class="jsPanel-error-content-separator"></div><p>${e}</p>`});},create(e={},t){jsPanel.zi||(jsPanel.zi=((e=jsPanel.ziBase)=>{let t=e;return {next:()=>t++}})()),e.config?delete(e=Object.assign({},this.defaults,e.config,e)).config:e=Object.assign({},this.defaults,e),e.id?"function"==typeof e.id&&(e.id=e.id()):e.id=`jsPanel-${jsPanel.idCounter+=1}`;const n=document.getElementById(e.id);if(null!==n){if(n.classList.contains("jsPanel")&&n.front(),this.errorReporting){let t=`&#9664; COULD NOT CREATE NEW JSPANEL &#9658;<br>An element with the ID <mark>${e.id}</mark> already exists in the document.`;jsPanel.errorpanel(t);}return !1}let o=this.pOcontainer(e.container);if("object"==typeof o&&o.length&&o.length>0&&(o=o[0]),!o){if(this.errorReporting){let e="&#9664; COULD NOT CREATE NEW JSPANEL &#9658;<br>The container to append the panel to does not exist";jsPanel.errorpanel(e);}return !1}["onbeforeclose","onbeforemaximize","onbeforeminimize","onbeforenormalize","onbeforesmallify","onbeforeunsmallify","onclosed","onfronted","onmaximized","onminimized","onnormalized","onsmallified","onstatuschange","onunsmallified"].forEach(t=>{e[t]?"function"==typeof e[t]&&(e[t]=[e[t]]):e[t]=[];});const a=e.template?e.template:this.createPanelTemplate();a.options=e,a.closetimer=void 0,a.status="initialized",a.currentData={},a.header=a.querySelector(".jsPanel-hdr"),a.headerbar=a.header.querySelector(".jsPanel-headerbar"),a.titlebar=a.header.querySelector(".jsPanel-titlebar"),a.headerlogo=a.headerbar.querySelector(".jsPanel-headerlogo"),a.headertitle=a.headerbar.querySelector(".jsPanel-title"),a.controlbar=a.headerbar.querySelector(".jsPanel-controlbar"),a.headertoolbar=a.header.querySelector(".jsPanel-hdr-toolbar"),a.content=a.querySelector(".jsPanel-content"),a.footer=a.querySelector(".jsPanel-ftr"),a.snappableTo=!1,a.snapped=!1,a.droppableTo=!1,a.autocloseProgressbar=a.querySelector(".jsPanel-autoclose-progressbar");const s=new CustomEvent("jspanelloaded",{detail:e.id,cancelable:!0}),l=new CustomEvent("jspanelstatuschange",{detail:e.id,cancelable:!0}),i=new CustomEvent("jspanelbeforenormalize",{detail:e.id,cancelable:!0}),r=new CustomEvent("jspanelnormalized",{detail:e.id,cancelable:!0}),c=new CustomEvent("jspanelbeforemaximize",{detail:e.id,cancelable:!0}),d=new CustomEvent("jspanelmaximized",{detail:e.id,cancelable:!0}),p=new CustomEvent("jspanelbeforeminimize",{detail:e.id,cancelable:!0}),h=new CustomEvent("jspanelminimized",{detail:e.id,cancelable:!0}),f=new CustomEvent("jspanelbeforesmallify",{detail:e.id,cancelable:!0}),m=new CustomEvent("jspanelsmallified",{detail:e.id,cancelable:!0}),u=new CustomEvent("jspanelsmallifiedmax",{detail:e.id,cancelable:!0}),g=new CustomEvent("jspanelbeforeunsmallify",{detail:e.id,cancelable:!0}),b=new CustomEvent("jspanelfronted",{detail:e.id,cancelable:!0}),y=new CustomEvent("jspanelbeforeclose",{detail:e.id,cancelable:!0}),j=new CustomEvent("jspanelclosed",{detail:e.id,cancelable:!0}),w=new CustomEvent("jspanelcloseduser",{detail:e.id,cancelable:!0});[s,l,i,r,c,d,p,h,f,m,u,g,b,y,j,w].forEach(e=>{e.panel=a;});const v=a.querySelector(".jsPanel-btn-close"),x=a.querySelector(".jsPanel-btn-maximize"),P=a.querySelector(".jsPanel-btn-normalize"),E=a.querySelector(".jsPanel-btn-smallify"),C=a.querySelector(".jsPanel-btn-minimize");"onpointerdown"in window&&a.controlbar.querySelectorAll(".jsPanel-btn").forEach(e=>{e.addEventListener("pointerdown",e=>{e.preventDefault();},!0);}),v&&jsPanel.pointerup.forEach(e=>{v.addEventListener(e,e=>{if(e.preventDefault(),e.button&&e.button>0)return !1;a.close(null,!0);});}),x&&jsPanel.pointerup.forEach(e=>{x.addEventListener(e,e=>{if(e.preventDefault(),e.button&&e.button>0)return !1;a.maximize();});}),P&&jsPanel.pointerup.forEach(e=>{P.addEventListener(e,e=>{if(e.preventDefault(),e.button&&e.button>0)return !1;a.normalize();});}),E&&jsPanel.pointerup.forEach(e=>{E.addEventListener(e,e=>{if(e.preventDefault(),e.button&&e.button>0)return !1;"normalized"===a.status||"maximized"===a.status?a.smallify():"smallified"!==a.status&&"smallifiedmax"!==a.status||a.unsmallify();});}),C&&jsPanel.pointerup.forEach(e=>{C.addEventListener(e,e=>{if(e.preventDefault(),e.button&&e.button>0)return !1;a.minimize();});});let F=jsPanel.extensions;for(let e in F)Object.prototype.hasOwnProperty.call(F,e)&&(a[e]=F[e]);if(a.clearTheme=(e=>(jsPanel.themes.forEach(e=>{["panel",`jsPanel-theme-${e}`,`panel-${e}`,`${e}-color`].forEach(e=>{a.classList.remove(e);}),a.header.classList.remove(`jsPanel-theme-${e}`);}),a.content.classList.remove("jsPanel-content-filled","jsPanel-content-filledlight"),a.header.classList.remove("jsPanel-hdr-light"),a.header.classList.remove("jsPanel-hdr-dark"),a.style.backgroundColor="",jsPanel.setStyle(a.headertoolbar,{boxShadow:"",width:"",marginLeft:"",borderTopColor:"transparent"}),jsPanel.setStyle(a.content,{background:"",borderTopColor:"transparent"}),a.header.style.background="",Array.prototype.slice.call(a.controlbar.querySelectorAll(".jsPanel-icon")).concat([a.headerlogo,a.headertitle,a.headertoolbar,a.content]).forEach(e=>{e.style.color="";}),e&&e.call(a,a),a)),a.getThemeDetails=(e=>{const t=e.toLowerCase(),n={color:!1,colors:!1,filling:!1},o=t.split("fill");if(n.color=o[0].trim().replace(/\s*/g,""),2===o.length)if(o[1].startsWith("edlight"))n.filling="filledlight";else if(o[1].startsWith("eddark"))n.filling="filleddark";else if(o[1].startsWith("ed"))n.filling="filled";else if(o[1].startsWith("color")){let e=o[1].split("color"),t=e[e.length-1].trim().replace(/\s*/g,"");jsPanel.colorNames[t]&&(t=jsPanel.colorNames[t]),t.match(/^([0-9a-f]{3}|[0-9a-f]{6})$/gi)&&(t="#"+t),n.filling=t;}if(jsPanel.themes.some(e=>e===n.color.split(/\s/i)[0])){let e=n.color.split(/\s/i)[0],t=document.createElement("button");t.className=e+"-bg",document.body.appendChild(t),n.color=getComputedStyle(t).backgroundColor.replace(/\s+/gi,""),document.body.removeChild(t),t=void 0;}else if(n.color.startsWith("bootstrap-")){let e=n.color.indexOf("-"),t=document.createElement("button");t.className="btn btn"+n.color.slice(e),document.body.appendChild(t),n.color=getComputedStyle(t).backgroundColor.replace(/\s+/gi,""),document.body.removeChild(t),t=void 0;}else if(n.color.startsWith("mdb-")){let e,t=n.color.indexOf("-")+1,o=document.createElement("span");e=n.color.endsWith("-dark")?(e=n.color.slice(t)).replace("-dark","-color-dark"):n.color.slice(t)+"-color",o.className=e,document.body.appendChild(o),n.color=getComputedStyle(o).backgroundColor.replace(/\s+/gi,""),document.body.removeChild(o),o=void 0;}return n.colors=jsPanel.calcColors(n.color),n}),a.applyColorTheme=(e=>{if(a.style.backgroundColor=e.colors[0],a.header.style.backgroundColor=e.colors[0],a.header.style.color=e.colors[3],[".jsPanel-headerlogo",".jsPanel-title",".jsPanel-hdr-toolbar"].forEach(t=>{a.querySelector(t).style.color=e.colors[3];}),a.querySelectorAll(".jsPanel-controlbar .jsPanel-btn").forEach(t=>{t.style.color=e.colors[3];}),"string"==typeof a.options.theme&&"filled"===e.filling&&(a.content.style.borderTop="#000000"===e.colors[3]?"1px solid rgba(0,0,0,0.15)":"1px solid rgba(255,255,255,0.15)"),"#000000"===e.colors[3]?a.header.classList.add("jsPanel-hdr-light"):a.header.classList.add("jsPanel-hdr-dark"),e.filling)switch(e.filling){case"filled":jsPanel.setStyle(a.content,{backgroundColor:e.colors[2],color:e.colors[3]});break;case"filledlight":a.content.style.backgroundColor=e.colors[1];break;case"filleddark":jsPanel.setStyle(a.content,{backgroundColor:e.colors[6],color:e.colors[7]});break;default:a.content.style.backgroundColor=e.filling,a.content.style.color=jsPanel.perceivedBrightness(e.filling)<=jsPanel.colorBrightnessThreshold?"#fff":"#000";}return a}),a.applyCustomTheme=(e=>{let t,n={bgPanel:"#fff",bgContent:"#fff",colorHeader:"#000",colorContent:"#000"},o=(t="object"==typeof e?Object.assign(n,e):n).bgPanel,s=t.bgContent,l=t.colorHeader,i=t.colorContent;if(jsPanel.colorNames[o]?a.style.background="#"+jsPanel.colorNames[o]:a.style.background=o,jsPanel.colorNames[l]&&(l="#"+jsPanel.colorNames[l]),[".jsPanel-headerlogo",".jsPanel-title",".jsPanel-hdr-toolbar"].forEach(e=>{a.querySelector(e).style.color=l;}),a.querySelectorAll(".jsPanel-controlbar .jsPanel-btn").forEach(e=>{e.style.color=l;}),jsPanel.colorNames[s]?a.content.style.background="#"+jsPanel.colorNames[s]:a.content.style.background=s,jsPanel.colorNames[i]?a.content.style.color="#"+jsPanel.colorNames[i]:a.content.style.color=i,jsPanel.perceivedBrightness(l)>jsPanel.colorBrightnessThreshold?a.header.classList.add("jsPanel-hdr-dark"):a.header.classList.add("jsPanel-hdr-light"),jsPanel.perceivedBrightness(i)>jsPanel.colorBrightnessThreshold?a.content.style.borderTop="1px solid rgba(255,255,255,0.15)":a.content.style.borderTop="1px solid rgba(0,0,0,0.15)",t.border){let e=t.border,n=e.lastIndexOf(" "),o=e.slice(++n);jsPanel.colorNames[o]&&(e=e.replace(o,"#"+jsPanel.colorNames[o])),a.style.border=e;}return a}),a.setBorder=(e=>{let t=jsPanel.pOborder(e);return t[2].length?jsPanel.colorNames[t[2]]&&(t[2]="#"+jsPanel.colorNames[t[2]]):t[2]=a.style.backgroundColor,t=t.join(" "),a.style.border=t,a.options.border=t,a}),a.setBorderRadius=(e=>{"number"==typeof e&&(e+="px"),a.style.borderRadius=e;const t=getComputedStyle(a);return a.options.header?(a.header.style.borderTopLeftRadius=t.borderTopLeftRadius,a.header.style.borderTopRightRadius=t.borderTopRightRadius):(a.content.style.borderTopLeftRadius=t.borderTopLeftRadius,a.content.style.borderTopRightRadius=t.borderTopRightRadius),a.options.footerToolbar?(a.footer.style.borderBottomRightRadius=t.borderBottomRightRadius,a.footer.style.borderBottomLeftRadius=t.borderBottomLeftRadius):(a.content.style.borderBottomRightRadius=t.borderBottomRightRadius,a.content.style.borderBottomLeftRadius=t.borderBottomLeftRadius),a}),a.setTheme=((t=e.theme,n)=>{let o;if("minimized"===a.status&&(o=!0,a.normalize()),a.clearTheme(),"object"==typeof t)e.border=void 0,a.applyCustomTheme(t);else {"none"===t&&(t="white");let e=a.getThemeDetails(t);a.applyColorTheme(e);}return o&&a.minimize(),n&&n.call(a,a),a}),a.remove=((e,t,n)=>{a.parentElement.removeChild(a),document.getElementById(e)?n&&n.call(a,e,a):(a.removeMinimizedReplacement(),t&&document.dispatchEvent(w),document.dispatchEvent(j),a.options.onclosed&&jsPanel.processCallbacks(a,a.options.onclosed,"every",t),jsPanel.autopositionRemaining(a),n&&n.call(e,e));}),a.close=((e,t)=>{if(a.closetimer&&window.clearInterval(a.closetimer),document.dispatchEvent(y),a.options.onbeforeclose&&a.options.onbeforeclose.length>0&&!jsPanel.processCallbacks(a,a.options.onbeforeclose,"some",a.status,t))return a;a.options.animateOut?(a.options.animateIn&&jsPanel.remClass(a,a.options.animateIn),jsPanel.setClass(a,a.options.animateOut),a.addEventListener("animationend",n=>{n.stopPropagation(),a.remove(a.id,t,e);})):a.remove(a.id,t,e);}),a.maximize=((t,n)=>{if(a.statusBefore=a.status,e.onbeforemaximize&&e.onbeforemaximize.length>0&&!jsPanel.processCallbacks(a,e.onbeforemaximize,"some",a.statusBefore))return a;document.dispatchEvent(c);const o=a.parentElement,s=jsPanel.pOcontainment(e.maximizedMargin);return o===document.body?(a.style.width=document.documentElement.clientWidth-s[1]-s[3]+"px",a.style.height=document.documentElement.clientHeight-s[0]-s[2]+"px",a.style.left=s[3]+"px",a.style.top=s[0]+"px",e.position.fixed||(a.style.left=window.pageXOffset+s[3]+"px",a.style.top=window.pageYOffset+s[0]+"px")):(a.style.width=o.clientWidth-s[1]-s[3]+"px",a.style.height=o.clientHeight-s[0]-s[2]+"px",a.style.left=s[3]+"px",a.style.top=s[0]+"px"),E.style.transform="unset",a.removeMinimizedReplacement(),a.status="maximized",a.setControls([".jsPanel-btn-maximize"]),n||a.front(),document.dispatchEvent(d),document.dispatchEvent(l),e.onstatuschange&&jsPanel.processCallbacks(a,e.onstatuschange,"every",a.statusBefore),t&&t.call(a,a,a.statusBefore),e.onmaximized&&jsPanel.processCallbacks(a,e.onmaximized,"every",a.statusBefore),a}),a.minimize=(t=>{if("minimized"===a.status)return a;if(a.statusBefore=a.status,e.onbeforeminimize&&e.onbeforeminimize.length>0&&!jsPanel.processCallbacks(a,e.onbeforeminimize,"some",a.statusBefore))return a;if(document.dispatchEvent(p),!document.getElementById("jsPanel-replacement-container")){const e=document.createElement("div");e.id="jsPanel-replacement-container",document.body.append(e);}if(a.style.left="-9999px",a.status="minimized",document.dispatchEvent(h),document.dispatchEvent(l),e.onstatuschange&&jsPanel.processCallbacks(a,e.onstatuschange,"every",a.statusBefore),e.minimizeTo){let t,n,o,s=a.createMinimizedReplacement();switch(e.minimizeTo){case"default":document.getElementById("jsPanel-replacement-container").append(s);break;case"parentpanel":(t=(o=(n=a.closest(".jsPanel-content").parentElement).querySelectorAll(".jsPanel-minimized-box"))[o.length-1]).append(s);break;case"parent":(t=(n=a.parentElement).querySelector(".jsPanel-minimized-container"))||((t=document.createElement("div")).className="jsPanel-minimized-container",n.append(t)),t.append(s);break;default:document.querySelector(e.minimizeTo).append(s);}}return t&&t.call(a,a,a.statusBefore),e.onminimized&&jsPanel.processCallbacks(a,e.onminimized,"every",a.statusBefore),a}),a.normalize=(t=>"normalized"===a.status?a:(a.statusBefore=a.status,e.onbeforenormalize&&e.onbeforenormalize.length>0&&!jsPanel.processCallbacks(a,e.onbeforenormalize,"some",a.statusBefore)?a:(document.dispatchEvent(i),a.style.width=a.currentData.width,a.style.height=a.currentData.height,a.snapped?a.snap(a.snapped,!0):(a.style.left=a.currentData.left,a.style.top=a.currentData.top),E.style.transform="unset",a.removeMinimizedReplacement(),a.status="normalized",a.setControls([".jsPanel-btn-normalize"]),a.front(),document.dispatchEvent(r),document.dispatchEvent(l),e.onstatuschange&&jsPanel.processCallbacks(a,e.onstatuschange,"every",a.statusBefore),t&&t.call(a,a,a.statusBefore),e.onnormalized&&jsPanel.processCallbacks(a,e.onnormalized,"every",a.statusBefore),a))),a.smallify=(t=>{if("smallified"===a.status||"smallifiedmax"===a.status)return a;if(a.statusBefore=a.status,e.onbeforesmallify&&e.onbeforesmallify.length>0&&!jsPanel.processCallbacks(a,e.onbeforesmallify,"some",a.statusBefore))return a;document.dispatchEvent(f),a.style.overflow="hidden";const n=window.getComputedStyle(a),o=parseFloat(window.getComputedStyle(a.headerbar).height);a.style.height=parseFloat(n.borderTopWidth)+parseFloat(n.borderBottomWidth)+o+"px",E.style.transform="rotate(180deg)","normalized"===a.status?(a.setControls([".jsPanel-btn-normalize"]),a.status="smallified",document.dispatchEvent(m),document.dispatchEvent(l),e.onstatuschange&&jsPanel.processCallbacks(a,e.onstatuschange,"every",a.statusBefore)):"maximized"===a.status&&(a.setControls([".jsPanel-btn-maximize"]),a.status="smallifiedmax",document.dispatchEvent(u),document.dispatchEvent(l),e.onstatuschange&&jsPanel.processCallbacks(a,e.onstatuschange,"every",a.statusBefore));const s=a.querySelectorAll(".jsPanel-minimized-box");return s[s.length-1].style.display="none",t&&t.call(a,a,a.statusBefore),e.onsmallified&&jsPanel.processCallbacks(a,e.onsmallified,"every",a.statusBefore),a}),a.unsmallify=(t=>{if(a.statusBefore=a.status,"smallified"===a.status||"smallifiedmax"===a.status){if(e.onbeforeunsmallify&&e.onbeforeunsmallify.length>0&&!jsPanel.processCallbacks(a,e.onbeforeunsmallify,"some",a.statusBefore))return a;document.dispatchEvent(g),a.style.overflow="visible",a.front(),"smallified"===a.status?(a.style.height=a.currentData.height,a.setControls([".jsPanel-btn-normalize"]),a.status="normalized",document.dispatchEvent(r),document.dispatchEvent(l),e.onstatuschange&&jsPanel.processCallbacks(a,e.onstatuschange,"every",a.statusBefore)):"smallifiedmax"===a.status?a.maximize():"minimized"===a.status&&a.normalize(),E.style.transform="rotate(0deg)";const n=a.querySelectorAll(".jsPanel-minimized-box");n[n.length-1].style.display="flex",t&&t.call(a,a,a.statusBefore),e.onunsmallified&&jsPanel.processCallbacks(a,e.onunsmallified,"every",a.statusBefore);}return a}),a.front=((t,n=!0)=>{if("minimized"===a.status)"maximized"===a.statusBefore?a.maximize():a.normalize();else {const e=Array.prototype.slice.call(document.querySelectorAll(".jsPanel-standard")).map(e=>e.style.zIndex);Math.max(...e)>a.style.zIndex&&(a.style.zIndex=jsPanel.zi.next()),jsPanel.resetZi();}return document.dispatchEvent(b),t&&t.call(a,a),e.onfronted&&n&&jsPanel.processCallbacks(a,e.onfronted,"every",a.status),a}),a.snap=((e,t=!1)=>{if(t||(a.currentData.beforeSnap={width:a.currentData.width,height:a.currentData.height}),e&&"function"==typeof e&&!t)e.call(a,a,a.snappableTo);else if(!1!==e){const e=[0,0];if(a.options.dragit.snap.containment&&a.options.dragit.containment){const t=jsPanel.pOcontainment(a.options.dragit.containment),n=a.snappableTo;n.startsWith("left")?e[0]=t[3]:n.startsWith("right")&&(e[0]=-t[1]),n.endsWith("top")?e[1]=t[0]:n.endsWith("bottom")&&(e[1]=-t[2]);}a.reposition(`${a.snappableTo} ${e[0]} ${e[1]}`);}t||(a.snapped=a.snappableTo);}),a.move=((e,t)=>{let n=a.overlaps(e,"paddingbox"),o=a.parentElement;return e.appendChild(a),a.options.container=e,a.style.left=n.left+"px",a.style.top=n.top+"px",a.saveCurrentDimensions(),a.saveCurrentPosition(),a.calcSizeFactors(),t&&t.call(a,a,e,o),a}),a.closeChildpanels=(e=>(a.getChildpanels().forEach(e=>e.close()),e&&e.call(a,a),a)),a.getChildpanels=(e=>{const t=a.content.querySelectorAll(".jsPanel");return e&&t.forEach((t,n,o)=>{e.call(t,t,n,o);}),t}),a.isChildpanel=(e=>{const t=a.closest(".jsPanel-content"),n=t?t.parentElement:null;return e&&e.call(a,a,n),!!t&&n}),a.contentRemove=(e=>(jsPanel.emptyNode(a.content),e&&e.call(a,a),a)),a.createMinimizedReplacement=(()=>{const t=jsPanel.createMinimizedTemplate(),n=window.getComputedStyle(a.headertitle).color,o=window.getComputedStyle(a),s=e.iconfont,l=t.querySelector(".jsPanel-controlbar");return "auto-show-hide"!==a.options.header?jsPanel.setStyle(t,{backgroundColor:o.backgroundColor,backgroundPositionX:o.backgroundPositionX,backgroundPositionY:o.backgroundPositionY,backgroundRepeat:o.backgroundRepeat,backgroundAttachment:o.backgroundAttachment,backgroundImage:o.backgroundImage,backgroundSize:o.backgroundSize,backgroundOrigin:o.backgroundOrigin,backgroundClip:o.backgroundClip}):t.style.backgroundColor=window.getComputedStyle(a.header).backgroundColor,t.id=a.id+"-min",t.querySelector(".jsPanel-headerbar").replaceChild(a.headerlogo.cloneNode(!0),t.querySelector(".jsPanel-headerlogo")),t.querySelector(".jsPanel-titlebar").replaceChild(a.headertitle.cloneNode(!0),t.querySelector(".jsPanel-title")),t.querySelector(".jsPanel-titlebar").setAttribute("title",a.headertitle.textContent),t.querySelector(".jsPanel-title").style.color=n,l.style.color=n,l.querySelectorAll("button").forEach(e=>{e.style.color=n;}),["jsPanel-hdr-dark","jsPanel-hdr-light"].forEach(e=>{a.header.classList.contains(e)&&t.querySelector(".jsPanel-hdr").classList.add(e);}),a.setIconfont(s,t),"onpointerdown"in window&&t.querySelectorAll(".jsPanel-btn").forEach(e=>{e.addEventListener("pointerdown",e=>{e.preventDefault();},!0);}),"enabled"===a.dataset.btnnormalize?jsPanel.pointerup.forEach(e=>{t.querySelector(".jsPanel-btn-normalize").addEventListener(e,()=>{a.normalize();});}):l.querySelector(".jsPanel-btn-normalize").style.display="none","enabled"===a.dataset.btnmaximize?jsPanel.pointerup.forEach(e=>{t.querySelector(".jsPanel-btn-maximize").addEventListener(e,()=>{a.maximize();});}):l.querySelector(".jsPanel-btn-maximize").style.display="none","enabled"===a.dataset.btnclose?jsPanel.pointerup.forEach(e=>{t.querySelector(".jsPanel-btn-close").addEventListener(e,()=>{a.close(null,!0);});}):l.querySelector(".jsPanel-btn-close").style.display="none",t}),a.removeMinimizedReplacement=(()=>{const e=document.getElementById(`${a.id}-min`);e&&e.parentElement.removeChild(e);}),a.dragit=(t=>{const n=Object.assign({},jsPanel.defaults.dragit,e.dragit),o=a.querySelectorAll(n.handles);return "disable"===t?o.forEach(e=>{e.style.pointerEvents="none";}):o.forEach(e=>{e.style.pointerEvents="auto";}),a}),a.resizeit=(e=>{const t=a.querySelectorAll(".jsPanel-resizeit-handle");return "disable"===e?t.forEach(e=>{e.style.pointerEvents="none";}):t.forEach(e=>{e.style.pointerEvents="auto";}),a}),a.getScaleFactor=(()=>{const e=a.getBoundingClientRect();return {x:e.width/a.offsetWidth,y:e.height/a.offsetHeight}}),a.calcSizeFactors=(()=>{const t=window.getComputedStyle(a);if("window"===e.container)a.hf=parseFloat(t.left)/(window.innerWidth-parseFloat(t.width)),a.vf=parseFloat(t.top)/(window.innerHeight-parseFloat(t.height));else if(a.parentElement){let e=a.parentElement.getBoundingClientRect();a.hf=parseFloat(t.left)/(e.width-parseFloat(t.width)),a.vf=parseFloat(t.top)/(e.height-parseFloat(t.height));}}),a.saveCurrentDimensions=((e=!1)=>{const t=window.getComputedStyle(a);a.currentData.width=t.width,"normalized"===a.status&&(a.currentData.height=t.height),e&&(a.style.height=t.height);}),a.saveCurrentPosition=(()=>{const e=window.getComputedStyle(a);a.currentData.left=e.left,a.currentData.top=e.top;}),a.reposition=((...t)=>{let n,o=e.position,s=!0;return t.forEach(e=>{"string"==typeof e||"object"==typeof e?o=e:"boolean"==typeof e?s=e:"function"==typeof e&&(n=e);}),jsPanel.position(a,o),s&&a.saveCurrentPosition(),n&&n.call(a,a),a}),a.repositionOnSnap=(t=>{let n="0",o="0",s=jsPanel.pOcontainment(e.dragit.containment);if(e.dragit.snap.containment)switch(t){case"left-top":n=s[3],o=s[0];break;case"right-top":n=-s[1],o=s[0];break;case"right-bottom":n=-s[1],o=-s[2];break;case"left-bottom":n=s[3],o=-s[2];break;case"center-top":n=s[3]/2-s[1]/2,o=s[0];break;case"center-bottom":n=s[3]/2-s[1]/2,o=-s[2];break;case"left-center":n=s[3],o=s[0]/2-s[2]/2;break;case"right-center":n=-s[1],o=s[0]/2-s[2]/2;}jsPanel.position(a,t),jsPanel.setStyle(a,{left:`calc(${a.style.left} + ${n}px)`,top:`calc(${a.style.top} + ${o}px)`});}),a.overlaps=((e,t,n)=>{let o,s=a.getBoundingClientRect(),l=getComputedStyle(a.parentElement),i=a.getScaleFactor(),r={top:0,right:0,bottom:0,left:0},c=0,d=0,p=0,h=0;"window"!==a.options.container&&"paddingbox"===t&&(r.top=parseInt(l.borderTopWidth,10)*i.y,r.right=parseInt(l.borderRightWidth,10)*i.x,r.bottom=parseInt(l.borderBottomWidth,10)*i.y,r.left=parseInt(l.borderLeftWidth,10)*i.x),o="string"==typeof e?"window"===e?{left:0,top:0,right:window.innerWidth,bottom:window.innerHeight}:"parent"===e?a.parentElement.getBoundingClientRect():document.querySelector(e).getBoundingClientRect():e.getBoundingClientRect(),n&&(c=n.touches?n.touches[0].clientX:n.clientX,d=n.touches?n.touches[0].clientY:n.clientY,p=c-o.left,h=d-o.top);let f=s.left<o.right&&s.right>o.left,m=s.top<o.bottom&&s.bottom>o.top;return {overlaps:f&&m,top:s.top-o.top-r.top,right:o.right-s.right-r.right,bottom:o.bottom-s.bottom-r.bottom,left:s.left-o.left-r.left,parentBorderWidth:r,panelRect:s,referenceRect:o,pointer:{clientX:c,clientY:d,left:p-r.left,top:h-r.top,right:o.width-p-r.right,bottom:o.height-h-r.bottom}}}),a.setSize=(()=>{if(e.panelSize){const t=jsPanel.pOsize(a,e.panelSize);a.style.width=t.width,a.style.height=t.height;}else if(e.contentSize){const t=jsPanel.pOsize(a,e.contentSize);a.content.style.width=t.width,a.content.style.height=t.height,a.style.width=t.width,a.content.style.width="100%";}return a}),a.resize=((...e)=>{let t,n=window.getComputedStyle(a),o={width:n.width,height:n.height},s=!0;e.forEach(e=>{"string"==typeof e?o=e:"object"==typeof e?o=Object.assign(o,e):"boolean"==typeof e?s=e:"function"==typeof e&&(t=e);});let l=jsPanel.pOsize(a,o);a.style.width=l.width,a.style.height=l.height,s&&a.saveCurrentDimensions(),a.status="normalized";let i=a.controlbar.querySelector(".jsPanel-btn-smallify");return i&&(i.style.transform="rotate(0deg)"),t&&t.call(a,a),a.calcSizeFactors(),a}),a.setControls=((e,t)=>(a.header.querySelectorAll(".jsPanel-btn").forEach(e=>{const t=e.className.split("-"),n=t[t.length-1];"hidden"!==a.getAttribute(`data-btn${n}`)&&(e.style.display="block");}),e.forEach(e=>{const t=a.controlbar.querySelector(e);t&&(t.style.display="none");}),t&&t.call(a,a),a)),a.setControlStatus=((e,t="enable",n)=>{const o=a.controlbar.querySelector(`.jsPanel-btn-${e}`);switch(t){case"disable":"removed"!==a.getAttribute(`data-btn${e}`)&&(a.setAttribute(`data-btn${e}`,"disabled"),o.style.pointerEvents="none",o.style.opacity=.4,o.style.cursor="default");break;case"hide":"removed"!==a.getAttribute(`data-btn${e}`)&&(a.setAttribute(`data-btn${e}`,"hidden"),o.style.display="none");break;case"show":"removed"!==a.getAttribute(`data-btn${e}`)&&(a.setAttribute(`data-btn${e}`,"enabled"),o.style.display="block",o.style.pointerEvents="auto",o.style.opacity=1,o.style.cursor="pointer");break;case"enable":"removed"!==a.getAttribute(`data-btn${e}`)&&("hidden"===a.getAttribute(`data-btn${e}`)&&(o.style.display="block"),a.setAttribute(`data-btn${e}`,"enabled"),o.style.pointerEvents="auto",o.style.opacity=1,o.style.cursor="pointer");break;case"remove":a.controlbar.removeChild(o),a.setAttribute(`data-btn${e}`,"removed");}return n&&n.call(a,a),a}),a.setControlSize=(e=>{const t=e.toLowerCase();a.controlbar.querySelectorAll(".jsPanel-btn").forEach(e=>{["jsPanel-btn-xl","jsPanel-btn-lg","jsPanel-btn-md","jsPanel-btn-sm","jsPanel-btn-xs"].forEach(t=>{e.classList.remove(t);}),e.classList.add(`jsPanel-btn-${t}`);}),"xl"===t?a.titlebar.style.fontSize="1.5rem":"lg"===t?a.titlebar.style.fontSize="1.25rem":"md"===t?a.titlebar.style.fontSize="1.05rem":"sm"===t?a.titlebar.style.fontSize=".9rem":"xs"===t&&(a.titlebar.style.fontSize=".8rem");}),a.setHeaderControls=(t=>{if(a.options.headerControls.add){let e=a.options.headerControls.add;Array.isArray(e)||(e=[e]),e.forEach(e=>{a.addControl(e);});}let n=[];a.controlbar.querySelectorAll(".jsPanel-btn").forEach(e=>{let t=e.className.match(/jsPanel-btn-[a-z0-9]{3,}/i)[0].substring(12);n.push(t);});const o=jsPanel.pOheaderControls(e.headerControls);return e.headerControls=o,n.forEach(e=>{o[e]&&a.setControlStatus(e,o[e]);}),a.setControlSize(o.size),t&&t.call(a,a),a}),a.setHeaderLogo=((e,t)=>{let n=[a.headerlogo],o=document.querySelector("#"+a.id+"-min");return o&&n.push(o.querySelector(".jsPanel-headerlogo")),"string"==typeof e?"<"!==e.substr(0,1)?n.forEach(t=>{jsPanel.emptyNode(t);let n=document.createElement("img");n.src=e,t.append(n);}):n.forEach(t=>{t.innerHTML=e;}):n.forEach(t=>{jsPanel.emptyNode(t),t.append(e);}),a.headerlogo.childNodes.forEach(e=>{e.nodeName&&"IMG"===e.nodeName&&e.setAttribute("draggable","false");}),t&&t.call(a,a),a}),a.setHeaderRemove=(e=>(a.removeChild(a.header),a.content.classList.add("jsPanel-content-noheader"),["close","maximize","normalize","minimize","smallify"].forEach(e=>{a.setAttribute(`data-btn${e}`,"removed");}),e&&e.call(a,a),a)),a.setHeaderTitle=((e,t)=>{let n=[a.headertitle],o=document.querySelector("#"+a.id+"-min");return o&&n.push(o.querySelector(".jsPanel-title")),"string"==typeof e?n.forEach(t=>{t.innerHTML=e;}):"function"==typeof e?n.forEach(t=>{jsPanel.emptyNode(t),t.innerHTML=e();}):n.forEach(t=>{jsPanel.emptyNode(t),t.append(e);}),t&&t.call(a,a),a}),a.setIconfont=((e,t=a,n)=>{if(e){let n,o;if("fa"===e||"far"===e||"fal"===e||"fas"===e||"fad"===e)n=[`${e} fa-window-close`,`${e} fa-window-maximize`,`${e} fa-window-restore`,`${e} fa-window-minimize`,`${e} fa-chevron-up`];else if("material-icons"===e)n=[e,e,e,e,e,e],o=["close","fullscreen","fullscreen_exit","call_received","expand_less"];else if(Array.isArray(e))n=[`custom-control-icon ${e[4]}`,`custom-control-icon ${e[3]}`,`custom-control-icon ${e[2]}`,`custom-control-icon ${e[1]}`,`custom-control-icon ${e[0]}`];else {if("bootstrap"!==e&&"glyphicon"!==e)return t;n=["glyphicon glyphicon-remove","glyphicon glyphicon-fullscreen","glyphicon glyphicon-resize-full","glyphicon glyphicon-minus","glyphicon glyphicon-chevron-up"];}t.querySelectorAll(".jsPanel-controlbar .jsPanel-btn").forEach(e=>{jsPanel.emptyNode(e).innerHTML="<span></span>";}),Array.prototype.slice.call(t.querySelectorAll(".jsPanel-controlbar .jsPanel-btn > span")).reverse().forEach((t,a)=>{t.className=n[a],"material-icons"===e&&(t.textContent=o[a]);});}return n&&n.call(t,t),t}),a.addToolbar=((e,t,n)=>{if("header"===e?e=a.headertoolbar:"footer"===e&&(e=a.footer),"string"==typeof t)e.innerHTML=t;else if(Array.isArray(t))t.forEach(t=>{"string"==typeof t?e.innerHTML+=t:e.append(t);});else if("function"==typeof t){let n=t.call(a,a);"string"==typeof n?e.innerHTML=n:e.append(n);}else e.append(t);return e.classList.add("active"),n&&n.call(a,a),a}),a.addCloseControl=(()=>{let e=document.createElement("button"),t=a.content.style.color;return e.classList.add("jsPanel-addCloseCtrl"),e.innerHTML=jsPanel.icons.close,e.style.color=t,a.options.rtl&&e.classList.add("rtl"),a.appendChild(e),jsPanel.pointerup.forEach(t=>{e.addEventListener(t,e=>{if(e.preventDefault(),e.button&&e.button>0)return !1;a.close(null,!0);});}),jsPanel.pointerdown.forEach(t=>{e.addEventListener(t,e=>{e.preventDefault();});}),a}),a.addControl=(t=>{if(!t.html)return a;t.position||(t.position=1);const n=a.controlbar.querySelectorAll(".jsPanel-btn").length;let o=document.createElement("button");o.innerHTML=t.html,o.className=`jsPanel-btn jsPanel-btn-${t.name} jsPanel-btn-${e.headerControls.size}`,o.style.color=a.header.style.color,t.position>n?a.controlbar.append(o):a.controlbar.insertBefore(o,a.querySelector(`.jsPanel-controlbar .jsPanel-btn:nth-child(${t.position})`));const s=t.ariaLabel||t.name;return s&&o.setAttribute("aria-label",s),jsPanel.pointerup.forEach(e=>{o.addEventListener(e,e=>{if(e.preventDefault(),e.button&&e.button>0)return !1;t.handler.call(a,a,o);});}),t.afterInsert&&t.afterInsert.call(o,o),a}),a.setRtl=(()=>{[a.header,a.content,a.footer].forEach(t=>{t.dir="rtl",e.rtl.lang&&(t.lang=e.rtl.lang);});}),a.id=e.id,a.classList.add("jsPanel-"+e.paneltype),"standard"===e.paneltype&&(a.style.zIndex=this.zi.next()),o.append(a),a.front(!1,!1),a.setTheme(e.theme),e.boxShadow&&a.classList.add(`jsPanel-depth-${e.boxShadow}`),e.header){if(e.headerLogo&&a.setHeaderLogo(e.headerLogo),a.setIconfont(e.iconfont),a.setHeaderTitle(e.headerTitle),a.setHeaderControls(),jsPanel.isIE){let e=[a.headerbar,a.controlbar];switch(a.options.headerControls.size){case"md":e.forEach(e=>{e.style.height="34px";});break;case"xs":e.forEach(e=>{e.style.height="26px";});break;case"sm":e.forEach(e=>{e.style.height="30px";});break;case"lg":e.forEach(e=>{e.style.height="38px";});break;case"xl":e.forEach(e=>{e.style.height="42px";});}}if("auto-show-hide"===e.header){let t="jsPanel-depth-"+e.boxShadow;a.header.style.opacity=0,a.style.backgroundColor="transparent",this.remClass(a,t),this.setClass(a.content,t),a.header.addEventListener("mouseenter",()=>{a.header.style.opacity=1,jsPanel.setClass(a,t),jsPanel.remClass(a.content,t);}),a.header.addEventListener("mouseleave",()=>{a.header.style.opacity=0,jsPanel.remClass(a,t),jsPanel.setClass(a.content,t);});}}else a.setHeaderRemove(),e.addCloseControl&&a.addCloseControl();if(e.headerToolbar&&a.addToolbar(a.headertoolbar,e.headerToolbar),e.footerToolbar&&a.addToolbar(a.footer,e.footerToolbar),e.border&&a.setBorder(e.border),e.borderRadius&&a.setBorderRadius(e.borderRadius),e.content&&("function"==typeof e.content?e.content.call(a,a):"string"==typeof e.content?a.content.innerHTML=e.content:a.content.append(e.content)),e.contentAjax&&this.ajax(a,e.contentAjax),e.contentFetch&&this.fetch(a),e.contentOverflow){const t=e.contentOverflow.split(" ");1===t.length?a.content.style.overflow=t[0]:2===t.length&&(a.content.style.overflowX=t[0],a.content.style.overflowY=t[1]);}if(e.autoclose){"number"==typeof e.autoclose?e.autoclose={time:e.autoclose+"ms"}:"string"==typeof e.autoclose&&(e.autoclose={time:e.autoclose});let t=Object.assign({},jsPanel.defaultAutocloseConfig,e.autoclose);t.time&&"number"==typeof t.time&&(t.time+="ms");let n=a.autocloseProgressbar.querySelector("div");n.addEventListener("animationend",e=>{e.stopPropagation(),a.autocloseProgressbar.classList.remove("active"),a.close();}),t.progressbar&&(a.autocloseProgressbar.classList.add("active"),t.background?jsPanel.themes.indexOf(t.background)>-1?a.autocloseProgressbar.classList.add(t.background+"-bg"):jsPanel.colorNames[t.background]?a.autocloseProgressbar.style.background="#"+jsPanel.colorNames[t.background]:a.autocloseProgressbar.style.background=t.background:a.autocloseProgressbar.classList.add("success-bg")),n.style.animation=`${t.time} progressbar`;}if(e.rtl&&a.setRtl(),a.setSize(),a.status="normalized",e.position?this.position(a,e.position):a.style.opacity=1,document.dispatchEvent(r),a.calcSizeFactors(),e.animateIn&&(a.addEventListener("animationend",()=>{this.remClass(a,e.animateIn);}),this.setClass(a,e.animateIn)),e.syncMargins){let t=this.pOcontainment(e.maximizedMargin);e.dragit&&(e.dragit.containment=t,!0===e.dragit.snap?(e.dragit.snap=jsPanel.defaultSnapConfig,e.dragit.snap.containment=!0):e.dragit.snap&&(e.dragit.snap.containment=!0)),e.resizeit&&(e.resizeit.containment=t);}if(e.dragit?(["start","drag","stop"].forEach(t=>{e.dragit[t]?"function"==typeof e.dragit[t]&&(e.dragit[t]=[e.dragit[t]]):e.dragit[t]=[];}),this.dragit(a,e.dragit),a.addEventListener("jspaneldragstop",e=>{e.panel===a&&a.calcSizeFactors();},!1)):a.titlebar.style.cursor="default",e.resizeit){["start","resize","stop"].forEach(t=>{e.resizeit[t]?"function"==typeof e.resizeit[t]&&(e.resizeit[t]=[e.resizeit[t]]):e.resizeit[t]=[];}),this.resizeit(a,e.resizeit);let t=void 0;a.addEventListener("jspanelresizestart",e=>{e.panel===a&&(t=a.status);},!1),a.addEventListener("jspanelresizestop",n=>{n.panel===a&&("smallified"===t||"smallifiedmax"===t||"maximized"===t)&&parseFloat(a.style.height)>parseFloat(window.getComputedStyle(a.header).height)&&(a.setControls([".jsPanel-btn-normalize"]),a.status="normalized",document.dispatchEvent(r),document.dispatchEvent(l),e.onstatuschange&&jsPanel.processCallbacks(a,e.onstatuschange,"every"),a.calcSizeFactors());},!1);}if(a.saveCurrentDimensions(!0),a.saveCurrentPosition(),e.setStatus&&("smallifiedmax"===e.setStatus?a.maximize().smallify():"smallified"===e.setStatus?a.smallify():a[e.setStatus.substr(0,e.setStatus.length-1)]()),this.pointerdown.forEach(t=>{a.addEventListener(t,t=>{t.target.closest(".jsPanel-btn-close")||t.target.closest(".jsPanel-btn-minimize")||"standard"!==e.paneltype||a.front();},!1);}),e.onwindowresize){let t=e.onwindowresize;"window"===a.options.container&&window.addEventListener("resize",e=>{if(e.target===window){let n,o,s=a.status;"maximized"===s&&t?a.maximize(!1,!0):a.snapped&&"minimized"!==s?a.snap(a.snapped,!0):"normalized"===s||"smallified"===s||"maximized"===s?"function"==typeof t?t.call(a,e,a):(n=(window.innerWidth-a.offsetWidth)*a.hf,a.style.left=n<=0?0:n+"px",o=(window.innerHeight-a.offsetHeight)*a.vf,a.style.top=o<=0?0:o+"px"):"smallifiedmax"===s&&t&&a.maximize(!1,!0).smallify();}},!1);}if(e.onparentresize){let t=e.onparentresize,n=a.isChildpanel();if(n){const e=n.content;let o=[];document.addEventListener("jspanelresize",s=>{if(s.panel===n){o[0]=e.offsetWidth,o[1]=e.offsetHeight;let n,s,l=a.status;"maximized"===l&&t?a.maximize():a.snapped&&"minimized"!==l?a.snap(a.snapped,!0):"normalized"===l||"smallified"===l||"maximized"===l?"function"==typeof t?t.call(a,a,{width:o[0],height:o[1]}):(n=(o[0]-a.offsetWidth)*a.hf,a.style.left=n<=0?0:n+"px",s=(o[1]-a.offsetHeight)*a.vf,a.style.top=s<=0?0:s+"px"):"smallifiedmax"===l&&t&&a.maximize().smallify();}},!1);}}return this.globalCallbacks&&(Array.isArray(this.globalCallbacks)?this.globalCallbacks.forEach(e=>{e.call(a,a);}):this.globalCallbacks.call(a,a)),e.callback&&(Array.isArray(e.callback)?e.callback.forEach(e=>{e.call(a,a);}):e.callback.call(a,a)),t&&t.call(a,a),document.dispatchEvent(s),a}};

    /* src/JsPanel.svelte generated by Svelte v3.25.1 */
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
    	const headerTitle_slot_template = /*#slots*/ ctx[13].headerTitle;
    	const headerTitle_slot = create_slot(headerTitle_slot_template, ctx, /*$$scope*/ ctx[12], get_headerTitle_slot_context);
    	const headerToolbar_slot_template = /*#slots*/ ctx[13].headerToolbar;
    	const headerToolbar_slot = create_slot(headerToolbar_slot_template, ctx, /*$$scope*/ ctx[12], get_headerToolbar_slot_context);
    	const content_slot_template = /*#slots*/ ctx[13].content;
    	const content_slot = create_slot(content_slot_template, ctx, /*$$scope*/ ctx[12], get_content_slot_context);
    	const footerToolbar_slot_template = /*#slots*/ ctx[13].footerToolbar;
    	const footerToolbar_slot = create_slot(footerToolbar_slot_template, ctx, /*$$scope*/ ctx[12], get_footerToolbar_slot_context);

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

    			/*div0_binding*/ ctx[14](div0);
    			append(div4, t0);
    			append(div4, div1);

    			if (headerToolbar_slot) {
    				headerToolbar_slot.m(div1, null);
    			}

    			/*div1_binding*/ ctx[15](div1);
    			append(div4, t1);
    			append(div4, div2);

    			if (content_slot) {
    				content_slot.m(div2, null);
    			}

    			/*div2_binding*/ ctx[16](div2);
    			append(div4, t2);
    			append(div4, div3);

    			if (footerToolbar_slot) {
    				footerToolbar_slot.m(div3, null);
    			}

    			/*div3_binding*/ ctx[17](div3);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (headerTitle_slot) {
    				if (headerTitle_slot.p && dirty & /*$$scope*/ 4096) {
    					update_slot(headerTitle_slot, headerTitle_slot_template, ctx, /*$$scope*/ ctx[12], dirty, get_headerTitle_slot_changes, get_headerTitle_slot_context);
    				}
    			}

    			if (headerToolbar_slot) {
    				if (headerToolbar_slot.p && dirty & /*$$scope*/ 4096) {
    					update_slot(headerToolbar_slot, headerToolbar_slot_template, ctx, /*$$scope*/ ctx[12], dirty, get_headerToolbar_slot_changes, get_headerToolbar_slot_context);
    				}
    			}

    			if (content_slot) {
    				if (content_slot.p && dirty & /*$$scope*/ 4096) {
    					update_slot(content_slot, content_slot_template, ctx, /*$$scope*/ ctx[12], dirty, get_content_slot_changes, get_content_slot_context);
    				}
    			}

    			if (footerToolbar_slot) {
    				if (footerToolbar_slot.p && dirty & /*$$scope*/ 4096) {
    					update_slot(footerToolbar_slot, footerToolbar_slot_template, ctx, /*$$scope*/ ctx[12], dirty, get_footerToolbar_slot_changes, get_footerToolbar_slot_context);
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
    			/*div0_binding*/ ctx[14](null);
    			if (headerToolbar_slot) headerToolbar_slot.d(detaching);
    			/*div1_binding*/ ctx[15](null);
    			if (content_slot) content_slot.d(detaching);
    			/*div2_binding*/ ctx[16](null);
    			if (footerToolbar_slot) footerToolbar_slot.d(detaching);
    			/*div3_binding*/ ctx[17](null);
    		}
    	};
    }

    function isUndefined(v) {
    	return typeof v === "undefined";
    }

    function instance($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	const $$slots = compute_slots(slots);
    	let { border = undefined } = $$props;
    	let { borderRadius = undefined } = $$props;
    	let { headerLogo = undefined } = $$props;
    	let { headerTitle = undefined } = $$props;
    	let { theme = "default" } = $$props;
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
    					$$invalidate(18, panel = null);
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

    			if ($$slots["headerTitle"]) {
    				adjustedOptions.headerTitle = headerTitleElement;
    			}

    			if ($$slots["content"]) {
    				adjustedOptions.content = contentElement;
    			}

    			if ($$slots["headerToolbar"]) {
    				adjustedOptions.headerToolbar = headerToolbarElement;
    			}

    			if ($$slots["footerToolbar"]) {
    				adjustedOptions.footerToolbar = footerToolbarElement;
    			}

    			$$invalidate(18, panel = jsPanel.create(adjustedOptions));
    		}
    	}

    	function getPanel() {
    		return panel;
    	}

    	function div0_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			headerTitleElement = $$value;
    			$$invalidate(0, headerTitleElement);
    		});
    	}

    	function div1_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			headerToolbarElement = $$value;
    			$$invalidate(1, headerToolbarElement);
    		});
    	}

    	function div2_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			contentElement = $$value;
    			$$invalidate(2, contentElement);
    		});
    	}

    	function div3_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			footerToolbarElement = $$value;
    			$$invalidate(3, footerToolbarElement);
    		});
    	}

    	$$self.$$set = $$props => {
    		if ("border" in $$props) $$invalidate(4, border = $$props.border);
    		if ("borderRadius" in $$props) $$invalidate(5, borderRadius = $$props.borderRadius);
    		if ("headerLogo" in $$props) $$invalidate(6, headerLogo = $$props.headerLogo);
    		if ("headerTitle" in $$props) $$invalidate(7, headerTitle = $$props.headerTitle);
    		if ("theme" in $$props) $$invalidate(8, theme = $$props.theme);
    		if ("options" in $$props) $$invalidate(9, options = $$props.options);
    		if ("$$scope" in $$props) $$invalidate(12, $$scope = $$props.$$scope);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*panel, border, borderRadius, headerLogo, headerTitle, theme*/ 262640) {
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

    					if (!isUndefined(headerTitle) && !$$slots["headerTitle"]) {
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

    return JsPanel;

})));
