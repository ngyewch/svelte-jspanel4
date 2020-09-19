# Installation

```shell
$ npm install -D svelte-jspanel4 jspanel4
```

# CSS import

## rollup example

```shell
$ npm install -D rollup-plugin-postcss
```

`rollup.config.js` (excerpt)
```
import postcss from 'rollup-plugin-postcss';

export default {
  plugins: [
        // after the svelte plugin
        postcss({
            extract: true
        })
  ]
}
```

Import the CSS (from the main Javascript file, typically `main.js`):

```js
import 'jspanel4/dist/jspanel.css';
```

# Component import

```html
<script> 
    import JsPanel from 'svelte-jspanel4';
</script>
```
