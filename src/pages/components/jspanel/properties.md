# JsPanel / properties

```example height:300
<script>
    import JsPanel from 'svelte-jspanel4';

    let panel;
</script>

<style>
.content {
    padding: 0.5em;
}
</style>

<div>
    <button on:click={() => panel.show()}>Show panel</button>

    <JsPanel bind:this={panel}
             border="thick dashed orange"
             borderRadius="1rem"
             headerLogo="static/favicon.png"
             headerTitle="My panel"
             theme="dark">
        <div slot="content" class="content">
            <p>Hello, world!</p>
        </div>
    </JsPanel>
</div>
```
