# JsPanel / slots

```example height:400
<script>
    import JsPanel from 'svelte-jspanel4';

    import 'jspanel4/dist/jspanel.css';

    let panel;
</script>

<style>
.content {
    padding: 0.5em;
}

.btn {
    margin: 0;
}
</style>

<div>
    <button on:click={() => panel.show()}>Show panel</button>

    <JsPanel bind:this={panel}>
        <div slot="headerTitle">
            My panel
        </div>
        <div slot="headerToolbar">
            <button class="btn">Do something</button>
        </div>
        <div slot="content" class="content">
            <p>Hello, world!</p>
        </div>
        <div slot="footerToolbar">
            <button class="btn">Cancel</button>
            <button class="btn">OK</button>
        </div>
    </JsPanel>
</div>
```
