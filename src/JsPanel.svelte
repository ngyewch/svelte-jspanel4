<script>
    import {jsPanel} from 'jspanel4';

    export let border = undefined;
    export let borderRadius = undefined;
    export let headerLogo = undefined;
    export let headerTitle = undefined;
    export let theme = 'default';
    export let options = undefined;

    let headerTitleElement;
    let headerToolbarElement;
    let contentElement;
    let footerToolbarElement;

    let panel;

    $: {
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

    function isUndefined(v) {
        return (typeof v === 'undefined');
    }

    export function show() {
        if (!panel) {
            const adjustedOptions = options ? {...options} : {};
            const onclosedFunctions = [(_panel, closedByUser) => {
                panel = null;
                return true;
            }];
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
            panel = jsPanel.create(adjustedOptions);
        }
    }

    export function getPanel() {
        return panel;
    }
</script>

<style>

</style>

<div style="display: none;">
    <div bind:this={headerTitleElement}>
        <slot name="headerTitle"/>
    </div>
    <div bind:this={headerToolbarElement}>
        <slot name="headerToolbar"/>
    </div>
    <div bind:this={contentElement} style="width: 100%; height: 100%;">
        <slot name="content"/>
    </div>
    <div bind:this={footerToolbarElement}>
        <slot name="footerToolbar"/>
    </div>
</div>
