'use mode strict';
(function () {

    class MControl {

        classes = new Map()
        outdated = new Map()
        rafid = null
        constructor() {

            window.addEventListener("load", _ =>
                this.rafid = requestAnimationFrame(_ => this.mrefreshloop())
            )

            window.addEventListener("unload", _ =>
                window.cancelAnimationFrame(this.rafid)
            )

        }
        register(ctrlclass) {
            // if (ctrlclass.prototype.isPrototypeOf(Controller)) {
            this.classes.set(ctrlclass.prototype.constructor.name, ctrlclass)
            //} else {
            //    console.error(`trying to regsister non Controller class : ${ctrlclass.prototype.name}`)
            //}
        }
        /**
         * start apps/controller labeled by a 'm-control' attribute. An app Controller is associated 
         * to a DOM subtree by adding attribute m-control="ControlClassName" to an HTMLElement
         * 
         * start() search the DOM for 'm-control' attribute to create the apps/controllers depending on 
         * provided parameters 
         * - strings are all resolved as HTMLElement using document.getElementById(string)
         * - case no args :  start all apps founded in document (one for each m-control attribute found in document)
         * - case HTMLElement:  start only apps found in provided elements or descendant 
         * - case Conroller:  start only apps found in provided element or descendant for Controller passes in arguments
         * 
         * @param? {string|HTMLElement|Controller} args list of arguments 
         * @example  
         *      // starts all the apps/controller found in document
         *      MC.start() 
         *      // starts all the apps/controller found in document.body
         *      MC.start(document.body) 
         *      // starts all the apps/controller found in element whith id = 'myid' 
         *      MC.start('myid') 
         *      // starts the apps/controller of class MCtrlHello (element labeled m-control="MCtrlHello") in document
         *      MC.start(MCtrlHello) 
         */
        start(...args) {
            const elems = []
            const ctrls = []
            args.forEach((arg, i) => {
                if (arg instanceof HTMLElement) return elems.push(arg)
                if (arg instanceof this.Controller) return ctrls.push(arg)
                if (typeof arg === 'string') {
                    const elem = document.getElementById(id)
                    if (elem) return elems.push(elem)
                    console.error(`MController start error argument ${i} element of id="${arg}" not found`)
                }
                console.error(`MController start error argument ${i} with id="${elem}' not found`)
            })
            if (elems.length === 0) elems.push(document.documentElement)
            // --- Creation phase in controller lifecycle

            elems.forEach(elem => {
                const appelems = m_controls(elem, ctrls)
                appelems.forEach(appelem => {
                    const ctrlname = appelem.getAttribute('m-control')
                    if (!ctrlname) return
                    const ctrlclass = this.classes.get(ctrlname)
                    if (!ctrlclass)
                        return console.error(`MControl start error Controller '${ctrlname}' isn't defined at  at ${elem.outerHTML.substr(0, 50)}`)
                    try {
                        appelem.$mcontrol = new ctrlclass()
                        // --- start controller
                        appelem.$mcontrol.start(appelem)
                    } catch (e) {
                        return console.error(`MControl creation error for '${ctrlname}' :  ${e.message} at ${appelem.outerHTML.substr(0, 50)}`)
                    }
                })
            })
        }

        mrefreshloop() {
            this.outdated.forEach((v, k) => k.render())
            this.outdated = new Map()
            requestAnimationFrame(_ => this.mrefreshloop());
        }
    }
    // javascript reserved word are forbidden property names 
    const reserved = [ 
        'do','if','in','for','let','new','try','var','case','else','enum','eval','null','this','true','void','with','await',
        'break','catch','class','const','false','super','throw','while','yield','delete','export','import','public','return',
        'static','switch','typeof','default','extends','finally','package','private','continue','debugger','function',
        'arguments','interface','protected','implements','instanceof']
        .reduce((p,k) => {p[k] = 1; return p} ,{})

    class Controller {
        debug = true
        element = null
        renderlist = []
        constructor() {
            this.modelvers = {}
            this.refs = {}
            const closure = () => {
                const model = new Proxy({},
                    {
                        set: (obj, prop, value) => {
                            if (prop in reserved) {
                                this.$error(`dynamic property name '${prop}' is a reserved word`)
                                return true
                            }
                            this.modelvers[prop] ? this.modelvers[prop]++ : (this.modelvers[prop] = 1)
                            obj[prop] = value
                            this.outdate(prop)
                            return true
                        },
                        deleteProperty: function (target, property) {
                            return false
                        }
                    })
                Object.defineProperty(this, 'model', {
                    get: function () { return model },
                    set: function () { throw new Error('never set MC.model property') }
                });
            }
            closure()
        }
        get propnames() {
            return this.model ? Object.keys(this.model) : {}
        }
        $build() {
            m_compile_refs(this)
            m_compile_texts(this)
            m_compile_events(this)
            m_compile_bindings(this)
            m_compile_classes(this)
            m_compile_styles(this)

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
        /**
         * @param {string|HTMLElement|Node|} a 
         * @param {*} b 
         * @param {*} c 
         */
        $error(...args) {
            //var args = [...arguments];
            const element = args.find(a => a instanceof HTMLElement)
            const node = args.find(a => a instanceof Node)
            const error = args.find(a => a instanceof Error) || new Error()
            const message = args.find(a => typeof a === 'string')
            console.error(`MControl error  ${message || ''}` 
            +`${ element ? '\n@elem: ' + element.outerHTML.substr(0, 50) : ''}`
            +`${ node ? '\n@node: ' + node.textContent.substr(0, 50) : ''}`
            +`${ (error && !error.stack) ? '\n@error: ' + error.message : ''}`
            +`${ (error && error.stack) ? '\n@error: ' + error.stack : ''}`)
        }
        start(element) {
            this.element = element

            // --- build phase in controller lifecycle
            this.$build()

            // --- Intialisation phase in controller lifecycle
            let res = this.init()
            res = (res && res.then) ? res : Promise.resolve()
            res.then(_ => this.render())
                .catch(error => this.$error(`during init phase`, this.elem, error))
        }
        render() {
            // this.renderlist contain a list off dom object attributes / text /HTMLElement
            this.renderlist.forEach(item => {
                const elem = (item.nodeType === Node.ELEMENT_NODE) ? item : item.ownerElement;
                const params = [this, elem, item, ...this.propnames.map(k => this.model[k])]
                try {
                    item.$mrender.call(...params)
                } catch (e) {
                    this.$error(`during rendering ${item.name}`, elem, e)
                }
            })
        }
        init() {
            // nothing to do // hook method
        }
        outdate(property) {
            if (!MC.outdated.has(this)) {
                MC.outdated.set(this, {})
            }
            MC.outdated.get(this)[property]++
        }

    }


    // ---------------------------------
    // INTERNAL FUNCTION 
    // ---------------------------------
    /**
     * collect end return nodes having 'm-control' attribute
     * @param {HTMLElement} elem : root dom element to start search
     * @param {Controller[]} ctrlclasses : controller class list to filer search
     * @return {HTMLElement[]} node list found
     */
    function m_controls(elem, ctrlclasses) {
        const ctrls = []
        const attr = elem.getAttribute('m-control')
        const selector = ctrlclasses.length ? ctrlclasses.map(ctrlclass => `[m-control="${ctrlclass.name}"]`).join(',') : '[m-control]'
        ctrlclasses.forEach(ctrlclass => (ctrlclass.name === attr) && ctrls.push(elem))
        elem.querySelectorAll(selector).forEach(elem => ctrls.push(elem))
        return ctrls;
    }

    /**
     * collect end return nodes having 'm-ref' attribute
     * @param {HTMLElement} elem root dom element to start search
     * @return {HTMLElement[]} node list found
     */
    function m_references(elem) {
        const refs = elem.getAttribute('m-ref') ? [elem] : []
        elem.querySelectorAll("[m-ref]").forEach(elem => refs.push(elem))
        return refs
    }

    /**
     * collect end return nodes having 'm-class' attribute
     * @param {HTMLElement} elem root dom element to start search
     * @return {HTMLElement[]} node list found
     */
    function m_classes(elem) {
        const classes = elem.getAttributeNode('m-class') ? [elem.getAttributeNode('m-class')] : []
        elem.querySelectorAll("[m-class]").forEach(elem => classes.push(elem.getAttributeNode('m-class')))
        return classes
    }

    /**
     * collect end return nodes having 'm-style' attribute
     * @param {HTMLElement} elem root dom element to start search
     * @return {HTMLElement[]} node list found
     */
    function m_styles(elem) {
        const styles = []
        const nodes = elem.querySelectorAll("*")
        nodes.forEach(
            node => [...node.attributes].forEach(
                attr => attr.nodeName.startsWith("m-style:") && styles.push(attr)
            )
        )
        return styles
    }

    /**
     * collect end return text nodes containing interpoations {{ ...expr... }}
     * @param {HTMLElement} elem root dom element to start search
     * @return {HTMLElement[]} node list found
     */
    function m_interpolated(elem) {
        var texts = [];
        const filter = child => child.nodeType == 3 && child.textContent.includes('{{') && texts.push(child)
        elem.childNodes.forEach(filter)
        elem.querySelectorAll("*").forEach(node => node.childNodes.forEach(filter))
        return texts
    }

    /**
     * collect end return having 'm-on:' modifier fr event bindings
     * @param {HTMLElement} elem root dom element to start search
     * @return {HTMLElement[]} node list found
     */
    function m_events(elem) {
        const attrs = []
        const nodes = elem.querySelectorAll("*")
        nodes.forEach(
            node => [...node.attributes].forEach(
                attr => attr.nodeName.startsWith("m-on:") && attrs.push(attr)
            )
        )
        return attrs
    }

    /**
     * collect end return having 'm-bind:' modifier fr event bindings
     * @param {HTMLElement} elem root dom element to start search
     * @return {HTMLElement[]} node list found
     */
    function m_bindings(elem) {
        const binds = []
        const nodes = elem.querySelectorAll("*")
        nodes.forEach(
            node => [...node.attributes].forEach(
                attr => attr.nodeName.startsWith("m-bind:") && binds.push(attr)
            )
        )
        return binds
    }

    /**
     * Build-phase : pick every m-ref attribute to populate Controller.refs[] array 
     * property with corresponding elements for futur use.
     * @param {Controller} ctrl target controller 
     */
    function m_compile_refs(ctrl) {
        const reflist = m_references(ctrl.element)
        reflist.forEach(node => {
            const refname = node.getAttribute('m-ref')
            ctrl.refs[refname] = node
        })
    }

    /**
     * compile text node renderers declared with '{{ ...js expression...}}' syntax
     * execution context is:
     * - $node is binded to the text node 
     * - this is binded to controller
     * - all model properties are binded to their name
     * @param {Controller} ctrl target controller 
     */
    function m_compile_texts(ctrl) {
        // first argument is target Node element
        // folowwed by all model property names
        // finally the rendering code for rendeing function
        const params = ['$node', '$text', ...ctrl.propnames, 'return null']
        const ibody = params.length - 1

        // compiling text interpolation chunks
        m_interpolated(ctrl.element).forEach(text => {
            const body = [
                '$text.textContent = `',
                text.textContent.replace(/{{/g, '${').replace(/}}/g, '}'),
                '`'
            ].join('')
            params[ibody] = body
            try {
                text.$mrender = new Function(...params)
                ctrl.renderlist.push(text)
            } catch (e) {
                ctrl.$error(`during build for interpolated nodes`, e, text)
            }
        })
    }

    /**
     * compile event bindings declared with m-on: modifier
     * @param {Controller} ctrl target controller 
     */
    function m_compile_events(ctrl) {
        // compiling event binding with m-on:
        m_events(ctrl.element).forEach(attr => {
            const elem = attr.ownerElement
            const body = attr.textContent.replace(/{{|}}/g, '')
            const evtnames = attr.name.replace(/m-on:/, '').split('|')
            try {
                const func = new Function('$event', body).bind(ctrl)
                evtnames.forEach(evtname => elem.addEventListener(evtname, func))
            } catch (e) {
                ctrl.$error(`during build for event ${attr.name} binding`, e, elem)
            }
        })
    }
    /**
     * compile properties bindings declared with m-bind: modifier
     * @param {Controller} ctrl target controller 
     */
    function m_compile_bindings(ctrl) {
        // standard rendering parameters ($node,p1,p2,...,body)
        // first argument is target Node element
        // folowwed by all model property names
        // finally the rendering code for rendeing function
        const params = ['$node', '$attr', ...ctrl.propnames, 'return null']
        const ibody = params.length - 1

        // get all m-bind modifier
        m_bindings(ctrl.element)
            .forEach(attr => {
                const elem = attr.ownerElement
                const attrname = attr.name.replace(/m-bind:/, '')
                const proppath = attr.value
                const property = proppath.replace(/(\.|\[).*/,'')
                if (ctrl.propnames.find(v => v === property)) {
                    // create binding from model to input
                    // ----------------------------------
                    params[ibody] = `
                        if (!$node.$mversion || $node.$mversion < this.modelvers['${property}']) {
                            if (this.debug) console.log(\`model => input with model.${proppath}=\${JSON.stringify(this.model.${proppath})}  input[\${$node.type}]=\${$node['${attrname}']}\`)
                            $node['${attrname}'] = this.model.${proppath}
                            $node.$mversion = this.modelvers['${property}']
                        }
                    `
                    try {
                        attr.$mrender = new Function(...params)
                        ctrl.renderlist.push(attr)
                    } catch (e) {
                        ctrl.$error(`during build for '${attr.name}' binding`, e, elem)
                    }

                    // create binding from input to model
                    // ----------------------------------
                    try {
                        const body = `
                            const value = ($event.target.type === 'number') ? ($event.target['${attrname}'] === '') ? 0 : parseFloat($event.target['${attrname}']) : $event.target['${attrname}']
                            if (this.debug) console.log(\`input => model with model.${proppath}=\${JSON.stringify(this.model.${proppath})} input=\${ $event.target['${attrname}'] }\`)
                            this.model.${proppath} = value
                            this.model['${property}'] = this.model['${property}'] 
                            $event.target.$mversion = this.modelvers['${property}']            
                        `
                        const func = new Function('$event', body).bind(ctrl)
                        elem.addEventListener('change', func)
                        elem.addEventListener('input', func)
                        elem.addEventListener('paste', func)
                    } catch (e) {
                        ctrl.$error(`during build for '${attr.name}' binding`, e, elem)
                    }
                } else {
                    ctrl.$error(`during build for '${attr.name}' unknown binding`, elem)
                }
            })
    }

    /**
     * compile class bindings declared with m-class atribute
     * @param {Controller} ctrl target controller 
     */
    function m_compile_classes(ctrl) {
        const params = ['$node', '$attr', ...ctrl.propnames, 'return null']
        const ibody = params.length - 1
        // get all m-bind modifier
        m_classes(ctrl.element)
            .forEach(attr => {
                const elem = attr.ownerElement
                const property = elem.getAttribute('m-class')
                params[ibody] = ` 
                    if (${property}) Object.keys(${property}).forEach(classname =>
                        ${property}[classname]  ? $node.classList.add(classname) : $node.classList.remove(classname)
                    ) 
                `
                try {
                    attr.$mrender = new Function(...params)
                    ctrl.renderlist.push(attr)
                } catch (e) {
                    ctrl.$error(`during build for m-class bindings`, e, attr.ownerElement)
                }
            })
    }

    /**
     * compile style bindings declared with m-style atribute
     * @param {Controller} ctrl target controller 
     */
    function m_compile_styles(ctrl) {
        const params = ['$node', '$attr', ...ctrl.propnames, 'return null']
        const ibody = params.length - 1
        // get all m-bind modifier
        m_styles(ctrl.element)
            .forEach(attr => {
                const styleprop = attr.name.replace(/m-style:/, '')
                params[ibody] = `$node.style['${styleprop}'] = \`${attr.textContent}\``
                try {
                    attr.$mrender = new Function(...params)
                    ctrl.renderlist.push(attr)
                } catch (e) {
                    ctrl.$error(`during build for m-style bindings`, e, attr.ownerElement)
                }
            })
    }

    // create MC singleton
    const MC = new MControl()
    Object.defineProperty(MC, "Controller", {
        enumerable: true,
        configurable: false,
        writable: true,
        value: Controller
    });
    Object.defineProperty(window, "MControl", {
        enumerable: true,
        configurable: false,
        writable: false,
        value: MC
    });
    Object.defineProperty(window, "MC", {
        enumerable: true,
        configurable: false,
        writable: false,
        value: MC
    });

})()
