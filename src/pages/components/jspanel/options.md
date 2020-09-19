# JsPanel / options

```example height:300
<script>
    import JsPanel from 'svelte-jspanel4';

    let panel;
    let closedDate = null;

    const options = {
        panelSize: "300 150",
        position: {
            my: 'left-top',
            at: 'left-bottom',
            of: '#trigger',
            offsetY: '10px',
        },
        onclosed: (panel, closedByUser) => {
            closedDate = new Date();
        },
    };
</script>

<style>
.header {
    display: flex;
    flex-direction: row;
}

.content {
    padding: 0.5em;
}
</style>

<div>
    <div class="header">
        <button id="trigger" on:click={() => panel.show()}>Show panel</button>
        <div class="content">Last closed at: {closedDate ? closedDate.toLocaleTimeString() : ''}</div>
    </div>

    <JsPanel bind:this={panel}
             options={options}>
        <div slot="content" class="content">
            <p>Hello, world!</p>
        </div>
    </JsPanel>
</div>
```
