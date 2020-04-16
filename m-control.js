'use mode strict';
(function() {
    function m_controls(elem,ctrlclasses) {
        const selector = ctrlclasses.length ? ctrlclasses.map(ctrlclass => `[m-control="${ctrlclass.name}"]` ).join(',') : '[m-control]'
        const ctrls = [...elem.querySelectorAll(selector)];
        return ctrls
    }
    
    function m_references(elem) {
        const refs = [...elem.querySelectorAll("[m-ref]")]
        return refs
    }
    
    function m_interpolated(elem) {
        var texts = [];
        if (elem)  {
            const nodes = [...elem.querySelectorAll("*")]
            elem.childNodes.forEach(child => {
                child.nodeType == 3 && child.textContent.includes('{{') && texts.push(child)
            })
            nodes.forEach(node => {
                node.childNodes.forEach(child => {
                    child.nodeType == 3 && child.textContent.includes('{{') && texts.push(child)
                })
            })    
        }
        return texts
    }
    
    function m_on_attributes(elem) {
        const attrs = []
        const nodes = elem.querySelectorAll("*")
        nodes.forEach(
            node => [...node.attributes].forEach(
                attr => (attr.nodeName.startsWith("m-on:")) && attrs.push(attr)
            )
        )
        return attrs
    }
    
    function m_binds_attributes(elem) {
        const binds = []
        const nodes = elem.querySelectorAll("*")
        nodes.forEach(
            node => [...node.attributes].forEach(
                attr => (attr.nodeName.startsWith("m-bind:")) && binds.push(attr)
            )
        )
        return binds
    }
    
    var set_propertyobserver = function (node, property, ctrl) {
        var superProps = Object.getPrototypeOf(node);
        var superSet = Object.getOwnPropertyDescriptor(superProps, property).set;
        var superGet = Object.getOwnPropertyDescriptor(superProps, property).get;
        var newProps = {
            get: function () { return superGet.apply(this, arguments) },
            set: function (value) {
                ctrl.model[attr.textContent] = value
                return superSet.apply(this, arguments);
            }
        }
        Object.defineProperty(node, property, newProps);
    }
    
    
    window.MControl = class MControl {
    
        static register(ctrlclass) {
            MControl.classes.set(ctrlclass.name, ctrlclass)
        }
        /**
         * start apps/controller labeled by a m-control attribute
         * an app Controller is associated to a DOM subtree by adding attribute m-control="ControlClassName" to an HTMLElement
         * start search the DOM for this attribute to create the apps/controllers depending on parametters
         * @param? {string|HTMLElement|MControl.Controller} ...args list of arguments 
         *         - strings are all transformed to HTMLElement by calling document.getElementById(string)
         *         - case no args :  start all apps founded in document (one for each m-control attribute found in document)
         *         - case HTMLElement:  start only apps found in provided element or descendant 
         *         - case Conroller:  start only apps found in provided element or descendant for Controller passes in arguments
         */
        static start(...args) {
            const elems = []
            const ctrls = []
            args.forEach((arg,i) => {
                if (arg instanceof HTMLElement) return elems.push(arg)
                if (arg instanceof MControl.Controller) return ctrls.push(arg)
                if (typeof arg === 'string') {
                    const elem =document.getElementById(id)
                    if (elem) return elems.push(elem)
                    console.error(`MController start error argument ${i} element of id="${arg}" not found`)
                }
                console.error(`MController start error argument ${i} with id="${elem}' not found`)
            })
            if (elems.length === 0) elems.push(document.documentElement)
            // --- Creation phase in controller lifecycle
    
            elems.forEach(elem => {
                const appelems = m_controls(elem,ctrls)
                appelems.forEach(appelem => {
                    const ctrlname = appelem.getAttribute('m-control')
                    if (!ctrlname) return
                    const ctrlclass = MControl.classes.get(ctrlname)
                    if (!ctrlclass)
                        return console.error(`MControl start error Controller '${ctrlname}' isn't defined at  at ${elem.outerHTML.substr(0, 50)}`)
                    try {
                        appelem.$mcontrol = new ctrlclass(elem)
                        // --- start controller (buil)
                        appelem.$mcontrol.start()
                    } catch (e) {
                        return console.error(`MControl creation error for '${ctrlname}' :  ${e.message} at ${appelem.outerHTML.substr(0, 50)}`)
                    }
                })
            })
        }
    }
    MControl.Controller = class MController {
        constructor(element, properties) {
            this.element = element
            this.modelprops = properties
            this.modelvers = {}
            this.refs = {}
            const closure = () => {
                const model = new Proxy({},
                    {
                        set: (obj, prop, value) => {
                            this.modelvers[prop] ? this.modelvers[prop]++ : (this.modelvers[prop] = 1)
                            obj[prop] = value
                            this.outdate(prop)
                            return true
                        }
                    })
                Object.defineProperty(this, 'model', {
                    get: function () { return model },
                    set: function () { throw new Error('never set MControl.model property') }
                });
            }
            closure()
        }
        start() {
            // --- build phase in controller lifecycle
            this.$build()
    
            // --- Intialisation phase in controller lifecycle
            let res = this.init()
            res = (res && res.then) ? res : Promise.resolve()
            res.then(_ => this.render())
                .catch(error => this.error(`during init phase`, this.elem, error))
        }
        $build() {
            if (!this.modelprops) this.modelprops = Object.keys(this.model)
            this.$_compile_refs()
            this.$_compile_texts()
            this.$_compile_events()
            this.$_compile_bindings()
        }
    
        $_compile_refs() {
            const reflist = m_references(this.element)
            reflist.forEach(node => {
                const refname = node.getAttribute('m-ref')
                this.refs[refname]=node
            })
        }
        /**
         * compile text node bindings declared with '{{ ...js expression...}}' syntax
         */
        $_compile_texts() {
            // standard rendering parameters ($node,p1,p2,...,body)
            // first argument is target Node element
            // folowwed by all model property names
            // finally the rendering code for rendeing function
            const params = ['$node', ...this.modelprops, 'return null']
            const idxbody = params.length - 1
    
            // compiling text interpolation chunks
            this.texts = []
            m_interpolated(this.element).forEach(node => {
                const body = [
                    '$text.textContent = `',
                    node.textContent.replace(/{{/g, '${').replace(/}}/g, '}'), 
                    '`'
                ].join('')
                params[0] = '$text'
                params[idxbody] = body
                try {
                    const func = new Function(...params)
                    node.$mrender = func
                    this.texts.push(node)
                } catch (e) {
                    this.error(`during build for interpolated nodes`, e, node)
                }
            })
        }
    
        /**
         * compile event bindings declared with m-on: modifier
         */
        $_compile_events() {
            // compiling event binding with m-on:
            this.events = []
            m_on_attributes(this.element).forEach(attr => {
                const elem = attr.ownerElement
                const body = attr.textContent.replace(/{{|}}/g, '')
                const evtnames = attr.name.replace(/m-on:/, '').split('|')
                try {
                    const func = new Function('$event', body).bind(this)
                    evtnames.forEach(evtname => elem.addEventListener(evtname, func))
                    this.events.push(elem)
                } catch (e) {
                    this.error(`during build for event ${attr.name} binding`, e, elem)
                }
            })
        }
        /**
         * compile properties bindings declared with m-bind: modifier
         */
        $_compile_bindings() {
            // standard rendering parameters ($node,p1,p2,...,body)
            // first argument is target Node element
            // folowwed by all model property names
            // finally the rendering code for rendeing function
            const params = ['$node', ...this.modelprops, 'return null']
            const idxbody = params.length - 1
    
            this.binds = []
            // get all m-bind modifier
            m_binds_attributes(this.element)
                .forEach(attr => {
                    const elem = attr.ownerElement
                    const attrname = attr.name.replace(/m-bind:/, '')
                    params[0] = '$node'
                    if (this.modelprops.find(v => v === attr.value)) {
                        // create binding from model to input
                        // ----------------------------------
                        params[idxbody] = `this.$from_model_to_input('${attr.value}',$node,'${attrname}')`
                        try {
                            const func = new Function(...params)
                            attr.$mrender = func
                            this.binds.push(attr)
                        } catch (e) {
                            this.error(`during build for '${attr.name}' binding`, e, elem)
                        }
    
                        // create binding from input to model
                        // ----------------------------------
                        try {
                            const body = `this.$from_input_to_model('${attrname}',$event,'${attr.value}')`
                            const func = new Function('$event', body).bind(this)
                            elem.addEventListener('change', func)
                            elem.addEventListener('keyup', func)
                            elem.addEventListener('paste', func)
                        } catch (e) {
                            this.error(`during build for '${attr.name}' binding`, e, elem)
                        }
                        // set_propertyobserver(elem,attrname,this)
                    } else {
                        this.error(`during build for '${attr.name}' unknown binding`, elem)
                    }
                })
        }
        $from_input_to_model(nodeprop, event, modelprop) {
            const value = (event.target.type === 'number') ? (event.target[nodeprop] === '') ? 0 : parseFloat(event.target[nodeprop]) : event.target[nodeprop]
            //console.log(`input => model with model=${this.model[modelprop]}  input=${event.target[nodeprop] }`)
            this.model[modelprop] = value
            event.target.$mversion = this.modelvers[modelprop]
        }
        $from_model_to_input(modelprop, node, nodeprop) {
            if (!node.$mversion || node.$mversion < this.modelvers[modelprop]) {
                //console.log(`model => input with model=${this.model[modelprop]}  input=${node[nodeprop]}`)
                node[nodeprop] = this.model[modelprop]
                node.$mversion = this.modelvers[modelprop]
            }
        }
        render() {
            this.texts.forEach(node => {
                const params = [this, node, ...this.modelprops.map(k => this.model[k])]
                try {
                    node.$mrender.call(...params)
                } catch (e) {
                    this.error(`during interpolation rendering`, node, e)
                }
            })
            this.binds.forEach(node => {
                const params = [this, node.ownerElement, ...this.modelprops.map(k => this.model[k])]
                try {
                    node.$mrender.call(...params)
                } catch (e) {
                    this.error(`during attribute binding rendering`, node, e)
                }
            })
        }
        init() {
            // nothing to do // hook method
        }
        /**
         * 
         * @param {string|HTMLElement|Node|} a 
         * @param {*} b 
         * @param {*} c 
         */
        error(...args) {
            //var args = [...arguments];
            const element = args.find(a => a instanceof HTMLElement)
            const node = args.find(a => a instanceof Node)
            const error = args.find(a => a instanceof Error) || new Error()
            const message = args.find(a => typeof a === 'string')
            console.error(`MControl error  ${message || ''} 
            ${ element ? '\n@elem: ' + element.outerHTML.substr(0, 50) : ''}
            ${ node ? '\n@node: ' + node.textContent.substr(0, 50) : ''}
            ${ (error && !error.stack) ? '\n@error: ' + error.message : ''}
            ${ (error && error.stack) ? '\n@error: ' + error.stack : ''}`)
        }
        outdate(property) {
            if (!MControl.outdated.has(this)) {
                MControl.outdated.set(this, {})
            }
            MControl.outdated.get(this)[property]++
        }
    
    }
    
    MControl.classes = new Map()
    MControl.outdated = new Map()
    MControl.rafid = null
    
    // MControl refresh process 
    const mrefreshloop = () => {
        MControl.outdated.forEach((v, k) =>
            k.render()
        )
        MControl.outdated = new Map()
        requestAnimationFrame(mrefreshloop);
    }
    
    window.addEventListener("load", function (event) {
        MControl.rafid = requestAnimationFrame(mrefreshloop)
    })
    
    window.addEventListener("unload", function (event) {
        window.cancelAnimationFrame(MControl.rafid)
    })  
})()
