import { Store } from './store.js';
import '../m-control.js';
import '../m-example.js';

var store = new Store();

class Benchmark extends MC.Controller {
    constructor(...args) {
        super(...args)
        this.model.rows = store.data
        this.model.selected = store.selected
    }
    init() {
        this.refs.tbody.innerHTML = ''
        for (let i = 0; i < store.data.length; i++) {
            const elem = document.createElement('tr')
            elem.setAttribute('m-style:backGround',`\${ µ.rows[${i}].id === µ.selected ? 'red' : 'white' }`)
            elem.innerHTML = `
                <td>{{µ.rows[${i}].id}}</td>
                <td>
                    <a m-on:click="this.select(${i})">{{µ.rows[${i}].label}}</a>
                </td>
                <td> <a m-on:click='this.remove(${i})'> <i class="fa fa-lg fa-remove"></i> </a> </td>
                <td>-</td>
            `
            this.refs.tbody.appendChild(elem)
        }
        this.$build(this.refs.tbody)
    }
    add() {
        store.add();
        this.sync();
    }
    remove(id) {
        store.delete(id);
        this.sync();
    }
    select(id) {
        store.select(id);
        this.sync();
    }
    run() {
        store.run();
        this.sync();
    }
    update() {
        store.update();
        this.sync();
    }
    runLots() {
        store.runLots();
        this.sync();
    }
    clear() {
        store.clear();
        this.sync();
    }
    swapRows() {
        store.swapRows();
        this.sync();
    }
    sync() {
        this.model.rows = store.data;
        this.model.selected = store.selected;
        this.init()
    }
}
MControl.register(Benchmark)

