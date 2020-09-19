# JsPanel

## Basic usage
```example height:300
<script>
    import { onMount, onDestroy } from 'svelte';

    import JsPanel from 'svelte-jspanel4';

    let panel;
    let intervalHandle;
    let date;

    onMount(() => {
        intervalHandler = setInterval(intervalHandler, 1000);
    });

    onDestroy(() => {
        clearInterval(intervalHandler);
    });

    function intervalHandler() {
        date = new Date();
    }
</script>

<style>
.content {
    padding: 0.5em;
}
</style>

<div>
    <button on:click={() => panel.show()}>Show panel</button>

    <JsPanel bind:this={panel}
             headerTitle="My panel"
             theme="primary">
        <div slot="content" class="content">
            <p>Hello, world!</p>
            <p>Time now is {date}</p>
        </div>
    </JsPanel>
</div>
```

## Properties
```properties
border       | Border. See https://jspanel.de/#options/border              | String(undefined)
borderRadius | Border radius. See https://jspanel.de/#options/borderRadius | String/Integer(undefined)
headerLogo   | Header logo. See https://jspanel.de/#options/headerTitle    | String(undefined)
headerTitle  | Header title. See https://jspanel.de/#options/headerTitle   | String/Node/Function(undefined)
theme        | Theme. See https://jspanel.de/#options/theme                | String/Object('default')
options      | Options. See https://jspanel.de/#options/overview           | Object(undefined)
```

## Slots

| Name          | Description |
|---------------|-------------|
| headerTitle   | Header title. Overrides the `headerTitle` property. See https://jspanel.de/#options/headerTitle |
| headerToolbar | Header toolbar. See https://jspanel.de/#options/headerToolbar |
| content       | Content. See https://jspanel.de/#options/content |
| footerToolbar | Footer toolbar. See https://jspanel.de/#options/footerToolbar |

## Methods

| Name       | Description |
|------------|-------------|
| getPanel() | Returns the underlying `jsPanel` object instance. See https://jspanel.de/ |
