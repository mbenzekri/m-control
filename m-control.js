'use mode strict';
(function () {
    /**
     * @param {any} aclass
     */
    function classname(aclass) { return aclass.prototype.constructor.name }
    /**
     * @param {any} node
     */
    function parentNode(node) { return node.parentElement || node.ownerElement }

    class MControl {

        classes = new Map()
        controllers = []
        rafid = null
        debug = false
        currentid = 1
        constructor() {

            window.addEventListener("load", _ =>
                this.rafid = requestAnimationFrame(_ => this.$renderloop())
            )

            window.addEventListener("unload", _ =>
                window.cancelAnimationFrame(this.rafid)
            )

        }
        register(ctrlclass) {
            if (Controller.isPrototypeOf(ctrlclass)) {
                this.classes.set(ctrlclass.prototype.constructor.name, ctrlclass)
            } else {
                console.error(`trying to register non Controller class : ${ctrlclass.prototype.constructor.name}`)
            }
        }
        started(ctrl) {
            this.controllers.push(ctrl)
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
         * @param {(string|HTMLElement|Controller)[]} args list of arguments 
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
            const classes = []
            args.forEach((arg, i) => {
                if (arg instanceof HTMLElement) return elems.push(arg)
                if (arg instanceof Controller) return classes.push(arg)
                if (typeof arg === 'string') {
                    const elem = document.getElementById(arg)
                    if (elem) return elems.push(elem)
                    console.error(`MController start error argument ${i} element of id="${arg}" not found`)
                }
                console.error(`MController start error argument ${i} not of expected type string|HTMLElement|Controller`)
            })
            if (elems.length === 0) elems.push(document.documentElement)

            // --- Creation phase in controller lifecycle
            elems.forEach(elem => {
                const appelems = this.$controls(elem, classes)
                appelems.forEach(appelem => {
                    const ctrlname = appelem.getAttribute('m-control')
                    if (!ctrlname) return
                    const ctrlclass = this.classes.get(ctrlname)
                    if (!ctrlclass)
                        return console.error(`MControl start error Controller '${ctrlname}' isn't defined at  at ${elem.outerHTML.substr(0, 50)}`)
                    // try {
                    // @ts-ignore
                    appelem.$mcontrol = new ctrlclass()
                    // --- start controller
                    // @ts-ignore
                    appelem.$mcontrol.$start(appelem)
                    // } catch (e) {
                    //     return console.error(`MControl creation error for '${ctrlname}' :  ${e.message} at ${appelem.outerHTML.substr(0, 50)}`)
                    // }
                })
            })
        }

        /**
         * rendering loop for DOM refreshing when dynamic properties are outdated
         * This in an INTERNAL method dont use it
         */
        $renderloop() {
            this.controllers.forEach(ctrl => ctrl.ready && ctrl.dirty && ctrl.$render())
            requestAnimationFrame(_ => this.$renderloop());
        }
        /**
         * collect end return nodes having 'm-control' attribute
         * @param {HTMLElement} elem : root dom element to start search
         * @param {Controller[]} ctrlclasses : controller class list to filer search
         * @return {HTMLElement[]} node list found
         */
        $controls(elem, ctrlclasses) {
            const ctrls = []
            const attr = elem.getAttribute('m-control')
            const selector = ctrlclasses.length ? ctrlclasses.map(ctrlclass => `[m-control="${classname(ctrlclass)}"]`).join(',') : '[m-control]'
            ctrlclasses.forEach(ctrlclass => (classname(ctrlclass) === attr) && ctrls.push(elem))
            elem.querySelectorAll(selector).forEach(elem => ctrls.push(elem))
            return ctrls;
        }
        nextid() {
            return this.currentid++;
        }
    }

    // javascript reserved word are forbidden property names 
    const reserved = [
        'do', 'if', 'in', 'for', 'let', 'new', 'try', 'var', 'case', 'else', 'enum', 'eval', 'null', 'this', 'true', 'void', 'with', 'await',
        'break', 'catch', 'class', 'const', 'false', 'super', 'throw', 'while', 'yield', 'delete', 'export', 'import', 'public', 'return',
        'static', 'switch', 'typeof', 'default', 'extends', 'finally', 'package', 'private', 'continue', 'debugger', 'function',
        'arguments', 'interface', 'protected', 'implements', 'instanceof']
        .reduce((p, k) => { p[k] = 1; return p }, {})

    /**
     * The Controller class is the controller component of the MVS design pattern
     * Model–view–controller (usually known as MVC) is a software design pattern commonly used for developing user interfaces 
     * (see Wikipedia  https://en.wikipedia.org/wiki/Model-view-controller )
     * @property {Map<number,Node>} #renderers store all the node renderers (attribute m-xxx and text for m-text)
     *                              a property $mrender is added at controller compile time to render the ui for the modifier
     * @property {HTMLElement} #element the root element labeled by the 'm-control' modifier
     * @property {Node[]} #recording true wen recording access to dynamic properties 
     */
    class Controller {
        #renderers = new Map()
        #access = {}
        #element = null
        #model = null
        #usedby = new Map()
        #outdated = new Map()
        #ready = false
        constructor() {
            this.refs = {}
            this.#model = new Dynamic({})
            this.#model.$listen('all', '*', (type, path, version) => this.outdate(path, version))
        }
        get ready() { return this.#ready }
        get model() { return this.#model }
        get element() { return this.#element }
        get propnames() { return Object.keys(this.#model) }
        get dirty() { return !!this.#outdated.size }
        /**
         * @returns {void | Promise<void>}
         */
        init() { /*  nothing to do hook method to be specialized by new classes */ }

        $build(root = this.#element) {

            const collected = []
            // collect the items to compile
            const elemlist = [root, ...root.querySelectorAll("*")]
            for (let elem of elemlist) {
                if (elem.nodeType === Node.COMMENT_NODE && elem.$arraypath) {
                    collected.push({ type: 'm-for', elem, attr: elem })
                }
                for (let text of elem.childNodes) {
                    if (text.nodeType !== Node.TEXT_NODE || !text.textContent.includes('{{')) continue
                    collected.push({ type: 'm-text', elem, attr: text })
                }
                for (let attr of elem.attributes) {
                    if (!attr.name.startsWith('m-')) continue
                    const type = attr.name.replace(/:.*/, '')
                    if (!(type in compile) || type === 'm-text') continue
                    collected.push({ type, elem, attr })
                }
            }
            // compile colleted items
            for (let opts of collected) {
                // for loop attr parent node had been replace by a comment node
                const params = compile[opts.type](this, opts.elem, opts.attr)
                try {
                    if (!params) continue
                    opts.attr.$minode = MC.nextid()
                    opts.attr.$mversion = {}
                    opts.attr.$mrender = new Function(...params)
                    this.#renderers.set(opts.attr.$minode, opts.attr)
                } catch (e) {
                    this.$error(`during build for ${opts.type} compile/bindings`, e, opts.elem)
                    console.error(params)
                }
            }
        }
        $error(...args) {
            //var args = [...arguments];
            const element = args.find(a => a instanceof HTMLElement)
            const node = args.find(a => a instanceof Node)
            const error = args.find(a => a instanceof Error) || new Error()
            const message = args.find(a => typeof a === 'string')
            console.error(`MControl error  ${message || ''}`
                + `${element ? '\n@elem: ' + element.outerHTML.substr(0, 50) : ''}`
                + `${node ? '\n@node: ' + node.textContent.substr(0, 50) : ''}`
                + `${(error && !error.stack) ? '\n@error: ' + error.message : ''}`
                + `${(error && error.stack) ? '\n@error: ' + error.stack : ''}`)
        }
        $start(element) {
            this.#element = element

            // --- build phase in controller lifecycle
            this.$build()

            // --- Intialisation phase in controller lifecycle
            let res = this.init()
            res = (res && res.then) ? res : Promise.resolve()
            res.then(_ => this.$render(true))
                .catch(error => this.$error(`during init phase`, this.#element, error))
            // signal start to MC and enter rendering loop
            MC.started(this)
        }
        $render(full = false) {
            const torender = full ? this.#renderers : this.outdatedlist
            // torender contains a list triplet of [node,path,version] 
            // node is the dom to render (with $mrender function) : attributes / text / HTMLElement
            // path is the path into model of the outdated data
            // version is the new version of the data found in path
            torender.forEach(renderitem => {
                let dummy
                const [item, path, version] = Array.isArray(renderitem) ? renderitem : [renderitem]
                const elem = (item.nodeType === Node.ATTRIBUTE_NODE || item.nodeType === Node.TEXT_NODE) ? parentNode(item) : item
                const params = [this, elem, item, this.model, path, version]
                // record properties access during rendering
                this.model.$startrecord(item.$mversion)
                try { // render
                    item.$mrender.call(...params)
                } catch (e) {
                    this.$error(`during rendering ${item.name}`, elem, e)
                }
                // stop recording
                this.model.$stoprecord()
                // store dependencies
                //if (full) Object.keys(item.$mversion).forEach(key => item.$mversion[key] = 0)
                this.$setdependencies(item, item.$mversion)
            })
            if (full) this.$render()
            this.#ready = true
        }
        $setdependencies(node, accesses) {
            Object.keys(accesses).forEach(path => {
                let version = accesses[path]
                let pathuses
                if (this.#usedby.has(path)) {
                    pathuses = this.#usedby.get(path)
                } else {
                    pathuses = new Map()
                    this.#usedby.set(path, pathuses)
                }
                pathuses.set(node.$minode, version)
            })
        }

        outdate(path, version) {
            this.#outdated.set(path, version)
        }

        get outdatedlist() {
            const olist = new Map()
            this.#outdated.forEach((newversion, path) => {
                const list = this.#usedby.get(path)
                list && list.forEach((version, inode) => {
                    const node = this.#renderers.get(inode)
                    if (newversion > version) olist.set(node.$minode, [node, path, version])
                })
            })
            this.#outdated = new Map()
            return olist
        }
        /**
         * 
         * @param {Node} attr 
         */
        $rightscopes(attr) {
            const rscope = []
            let nodelem = parentNode(attr)
            while (nodelem !== this.#element) {
                if (nodelem.$rscope) rscope.unshift(...nodelem.$rscope)
                nodelem = nodelem.parentNode
            }
            return rscope.join('')
        }
        /**
         * 
         * @param {Node} attr 
         */
        $leftscopes(attr) {
            const lscope = {}
            let nodelem = parentNode(attr)
            while (nodelem !== this.#element) {
                if (nodelem.$lscope)
                    Object.keys(nodelem.$lscope)
                        .filter(varname => !(varname in lscope))
                        .forEach(varname => lscope[varname] = nodelem.$lscope[varname])
                nodelem = nodelem.parentNode
            }
            return lscope
        }
        /**
         * 
         * @param {Node} previous 
         * @param {Node} node 
         * @param {Element} template 
         * @param {any} scope 
         */
        $addNode(previous, template, scope) {
            var fragment = document.importNode(template.content, true);
            previous.after(fragment)
            const newnode = previous.nextElementSibling
            this.$setScope(newnode, scope)
            this.$build(newnode)
            return newnode
        }
        $setScope(node, scope) {
            node.$rscope = []
            node.$lscope = {}
            Object.keys(scope).forEach(varname => {
                const proppath = scope[varname]
                const fragment = `
                    if (MC.debug) console.log(\`scope ${varname} = \${JSON.stringify(${proppath})}\`)
                    let ${varname} = ${proppath};
                `
                node.$rscope.push(fragment)
                node.$lscope[varname] = proppath
            })
        }
    }

    // ---------------------------------
    // INTERNAL FUNCTION 
    // ---------------------------------
    function quote(text) {
        return text.replace(/'/g,"\\'")
    }
    const compile = {
        'm-ref': (ctrl, elem, attr) => {
            ctrl.refs[attr.value] = elem;
            return null
        },
        'm-class': (ctrl, elem, attr) => {
            const scope = ctrl.$rightscopes(attr)
            const body = scope + ` 
                const _value_ = ${attr.value}
                if ( _value_ && typeof _value_ === 'object' ) 
                    if (MC.debug) console.log("m-class rendering class= %s", JSON.stringify(_value_));
                    Object.keys(_value_).forEach(classname =>
                        _value_[classname]  ? $node.classList.add(classname) : $node.classList.remove(classname)
                    ) 
                //@ sourceURL=m-class-${attr.value}.js
            `
            const params = ['$node', '$attr', 'µ', body]
            return params
        },
        'm-style': (ctrl, elem, attr) => {
            const scope = ctrl.$rightscopes(attr)
            const styleprop = attr.name.replace(/m-style:/, '')
            const body = scope + `
                const _styleprop_ = '${styleprop}';
                const _stylevalue_ = \`${attr.value}\`;
                if (MC.debug) console.log('m-style rendering %s = %s',_styleprop_,_stylevalue_);
                $node.style[_styleprop_] = _stylevalue_;
            `
            return ['$node', '$attr', 'µ', body]
        },
        'm-on': (ctrl, elem, attr) => {
            const scope = ctrl.$rightscopes(attr)
            const evtnames = attr.name.replace(/m-on:/, '').split('|')
            const body = `
                const µ=this.model; 
                ${scope}
                if (MC.debug) console.log("m-on rendering event=\${$event.name} handler=  ${attr.value.replace('\"', '\'')}");
                ${attr.value}
            `
            try {
                const func = new Function('$event', body).bind(ctrl)
                evtnames.forEach(evtname => elem.addEventListener(evtname, func))
            } catch (e) {
                ctrl.$error(`during build for event ${attr.name} binding`, e, elem)
                console.error(body)
            }
            return null
        },
        'm-text': (ctrl, elem, text) => {
            const scope = ctrl.$rightscopes(text)
            const body = scope + ` 
                if (MC.debug) console.log('m-text rendering %s',$text.textContent)
                try {
                $text.textContent = \`${text.textContent.replace(/{{/g, '${').replace(/}}/g, '}')}\`;
                } catch(e){}
            `
            return ['$node', '$text', 'µ', body]
        },
        'm-get': (ctrl, elem, attr) => {
            const rscope = ctrl.$rightscopes(attr)
            const lscope = ctrl.$leftscopes(attr)
            const attrname = attr.name.replace(/m-[^:]*:/, '')
            let proppath = attr.value
            const proproot = proppath.replace(/(\.|\[).*$/, '')
            if (proproot in lscope) {
                proppath = lscope[proproot] + attr.value.replace(/^[^\.\[]*/, '')
            }

            // create binding from input to model
            const body = `
                const µ = this.model 
                ${ rscope}
                let _value_ = $event.target['${attrname}']
                _value_ = ($event.target.type === 'number') ? (_value_ === '') ? 0 : parseFloat(_value_) : _value_
                if (MC.debug) {
                    console.log("input => model with %s=%s input=%s",'${quote(proppath)}',JSON.stringify(${proppath}), _value_)
                }
                ${proppath} = _value_
            `
            try {
                const func = new Function('$event', body).bind(ctrl)
                elem.addEventListener('change', func)
                elem.addEventListener('input', func)
                elem.addEventListener('paste', func)
            } catch (e) {
                ctrl.$error(`during build for '${attr.name}' binding`, e, elem)
                console.error(body)
            }
        },
        'm-set': (ctrl, elem, attr) => {
            const rscope = ctrl.$rightscopes(attr)
            const attrname = attr.name.replace(/m-[^:]*:/, '')
            let proppath = attr.value
            // create binding from model to input
            const body = rscope + `
                if (MC.debug) console.log("model => input with %s=%s input/%s[%s]=%s", 
                    '${quote(proppath)}', JSON.stringify(${proppath}),
                    $node.type,'${quote(attrname)}',$node['${attrname}'])
                $node['${attrname}'] = ${proppath}
            `
            return ['$node', '$attr', 'µ', body]
        },
        'm-bind': (ctrl, elem, attr) => {
            compile['m-get'](ctrl, elem, attr)
            return compile['m-set'](ctrl, elem, attr)
        },
        'm-with': (ctrl, elem, attr) => {
            const varname = attr.name.replace(/m-[^:]*:/, '')
            const proppath = attr.value
            const fragment = `
                if (MC.debug) console.log(\`scope ${varname} = \${JSON.stringify(${proppath})}\`)
                let ${varname} = ${proppath};
            `
            if (!elem.$rscope) elem.$rscope = []
            if (!elem.$lscope) elem.$lscope = {}
            elem.$rscope.push(fragment)
            elem.$lscope[varname] = proppath
        },
        /**
         * 
         * @param {Controller} ctrl 
         * @param {HTMLElement} elem 
         * @param {Attr} attr 
         */
        'm-for': function (ctrl, template, attr) {
            const arraypath = attr.textContent
            const rscope = ctrl.$rightscopes(attr)
            const [type, varname, iname] = attr.name.split(':')
            const idxname = iname || '$index'
            // associate listeners to changes 
            template.$listener = (type, path, property, node) => {
                console.log(`event type=[${type}] on path='${path}' property='${property}' `)
            }
            template.$tail = template
            ctrl.model.$listen('push', arraypath, template.$listener)
            ctrl.model.$listen('pop', arraypath, template.$listener)
            ctrl.model.$listen('insert', arraypath, template.$listener)
            ctrl.model.$listen('change', arraypath, template.$listener)
            const body = rscope + `
                const _array_ = ${arraypath}
                const _itempath_ = "${arraypath}[${idxname}]"
                if (MC.debug) console.log(
                    "m-for rendering loop array=%s index=%s path=%s version=%d",
                    ${arraypath},${idxname},$path,$version
                )
                //if(!$path || $path == '${arraypath}') {
                    // initial or array ref change render all array
                    $node.$nodes = []
                    while ($node.$tail && $node.$tail != $node) {
                        const cur = $node.$tail
                        $node.$tail = $node.$tail.previousElementSibling()
                    }
                    $node.$tail =$node
                    _array_.forEach((_item_,_i_) => {
                        const _scope_ = {  "${idxname}" : _i_ , "${varname}" : "${arraypath}[${idxname}]"}
                        const _newnode_ = this.$addNode($node.$tail,$node,_scope_)
                        $node.$nodes[_i_] = _newnode_ 
                        $node.$tail = _newnode_
                    })
                // } else {
                //     debugger
                //     const _i_ = parseInt($path.replace(/^.*(\\d+)\\]$/,'$1'))
                //     const _node_ = $node.$nodes[_i_]
                //     if (!_node_) { 
                //         // item changed in array
                //         const _scope_ = {  "${idxname}" : _i_ , "${varname}" : "${arraypath}[${idxname}]"}
                //         const _newnode_ = this.$addNode($node.$tail,$node,_scope_)
                //         $node.$nodes[_i_] = _newnode_ 
                //         $node.$tail = _newnode_
                //     }
                //}
                //@ sourceURL=array_listener_${arraypath}.js
            `
            return ['$node', '$attr', 'µ', '$path', '$version', body]
        }
    }
    /** ---------------
     * Dynamic class contruct an internal structure with a provided plain javascript object
     * this data may be accessed and modified using usual syntax dot an brackets : dynamic.property or dynamic.property[i]
     * each access and changes to the data may trigger an event when listeners provided
     */
    const modeltype = document.implementation.createDocumentType("dynamic", "SYSTEM", "");
    class Dynamic {
        #handler = {
            get: (node, property) => {
                return this.getproperty(node, property)
            },
            set: (node, property, value) => {
                this.setproperty(node, property, value)
                return true
            },
            getPrototypeOf: () => Object.prototype,
            setPrototypeOf: () => null,
            isExtensible: () => true,
            preventExtensions: () => null,
            getOwnPropertyDescriptor: (target, property) => {
                const found = this.getnodeproperty(target, property)
                if (found) return { writable: true, configurable: true, enumerable: true }
            },
            defineProperty: () => null,
            has: (target, property) => {
                const found = this.getnodeproperty(target, property)
                return !!found
            },
            deleteProperty: (target, property) => {
                const found = this.getnodeproperty(target, property)
                if (found) found.parentNode.removeChild(found)
            },
            ownKeys: (target) => [...target.childNodes].map(node => node.nodeName),
        }
        #access = null

        /**
         * @param {Object} data data to be managed and observed
         * @param {(path:string,version:number) => void} onupdate listener for data tree properties updates
         */
        constructor(data, onupdate) {
            this.onupdate = onupdate || (() => 0)
            this.listeners = new Map()
            const root = document.implementation.createDocument(null, '_____dyn', modeltype).documentElement
            if (!(data instanceof Object))
                throw new Error(`Only object can be domified, type '${typeof data}'' was provided`)

            // listen for changes 
            var observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    const version = this.getversion(mutation.target)
                    const path = this.path(mutation.target)
                    //console.log(`mutation type=%s path=%s version=%d nodes=%d`, mutation.type, path, version, mutation.addedNodes.length)
                    this.trigger('change', path, version)
                })
            });
            observer.observe(root, { subtree: true, attributes: true, attributeFilter: ['version'] });

            // recursively add data values in root XML document
            Object.getOwnPropertyNames(data).forEach(property => {
                const value = data[property]
                this.setproperty(root, property, value)
            })

            return new Proxy(root, this.#handler)
        }

        /**
         * return the value of the property for a provided node
         * @param {Element} node 
         * @param {string} property 
         */
        getproperty(node, property) {

            // version number for property may be requested adding $v to property name
            // ex: µ.prop1,prop2$v
            // check if version number requested
            const vread = (typeof property === 'string') && property.endsWith('$v')
            property = vread ? property.replace(/\$v$/, '') : property

            // search fo property first
            const found = (node.getAttribute('type') === 'array' && /\d+/.test(property))
                ?   node.childNodes[parseInt(property)]
                : [...node.childNodes].find(child => child.nodeName === property)
            // search method instead
            if (!found) return this.getmethod(node, property)

            // if version property requested
            const version = this.getversion(found)
            if (vread) return version

            // store access version if expected
            if (this.#access) this.#access[this.path(found)] = version

            // extract and return property as Dynamic object (Proxy)
            const type = found.getAttribute('type')
            switch (type) {
                case 'number': return parseFloat(found.textContent)
                case 'boolean': return (found.textContent === 'true')
                case 'string': return found.textContent
                case 'undefined': return undefined
                case 'null': return null
                case 'date': return new Date(found.textContent)
                // @ts-ignore
                case 'array': return new Proxy(found, this.#handler)
                // @ts-ignore
                default: return new Proxy(found, this.#handler)
            }
        }

        /**
         * 
         * @param {Element} node 
         */
        getversion(node) {
            return parseInt(node.getAttribute('version'))
        }
        /**
         * 
         * @param {Node} node 
         * @param {string} property 
         * @returns {Node}
         */
        getnodeproperty(node, property) {
            return [...node.childNodes].find(child => child.nodeName === property)
        }
        /**
         * 
         * @param {any} value 
         */
        getvaluetype(value) {
            if (value === null) return 'null'
            if (value === '') return 'string'
            if (Array.isArray(value)) return 'array'
            if (value instanceof Date) return 'date'
            return typeof value
        }

        setproperty(node, property, value) {
            if (/\d+/.test(property) || typeof property === 'number') property = `_${property}`
            let found = [...node.childNodes].find(child => child.nodeName === property)
            const type = this.getvaluetype(value)
            let current, version
            if (found) {
                current = found
                version = parseInt(found.getAttribute('version')) + 1
                current.setAttribute('version', version)
            } else {
                current = node.ownerDocument.createElement(property)
                version = 1
                node.appendChild(current)
                current.setAttribute('version', version)
            }
            current.setAttribute('type', type)

            switch (type) {
                case 'boolean':
                case 'number':
                case 'string':
                    current.textContent = value.toString()
                    break
                case 'undefined':
                case 'null':
                    current.textContent = ''
                    break
                case 'date':
                    current.textContent = value.toISOString()
                    break;
                case 'array':
                    current.textContent = ''
                    value.forEach((value, index) => {
                        this.setproperty(current, index, value)
                    })
                    /// this.trigger('change', this.path(node,property), property)
                    break
                case 'object':
                    current.textContent = ''
                    Object.getOwnPropertyNames(value).forEach((property) => {
                        const val = value[property]
                        this.setproperty(current, property, val)
                    })
                    break
            }
        }
        /**
         * get property path of a node
         * @param {Node} node
         * @returns {string} 
         */
        path(node) {
            const path = []
            while (node && node.nodeName !== '_____dyn') {
                path.unshift(node.nodeName)
                node = node.parentNode
            }
            return path.join('.').replace(/\._(\d+)/g, '[$1]')
        }
        trigger(type, path, version) {
            [`${type}/${path}`, 'all/*'].forEach(key => {
                if (this.listeners.has(key)) {
                    this.listeners.get(key).forEach((listener => {
                        listener(type, path, version);
                    }))
                }
            })
        }
        getmethod(node, property) {
            if (property === '$listen') {
                return (type, path, listener) => {
                    if (/^(all|push|pop|insert|change)$/.test(type)) {
                        const key = `${type}/${(type === 'all') ? '*' : path}`
                        const list = this.listeners.get(key) || []
                        if (list.length === 0) this.listeners.set(key, list)
                        list.push(listener)
                    } else {
                        console.log(`Dynamic $listen() type '${type}' unknown `)
                    }
                    return listener
                }
            }
            if (property === '$unlisten') {
                return listener => {
                    this.listeners.forEach((current, key) => {
                        const index = current.indexOf(listener)
                        if (index >= 0) current.splice(index)
                    })
                }
            }
            if (property === '$startrecord') return (versions) => this.#access = versions
            if (property === '$stoprecord') return () => this.#access = null

            switch (node.getAttribute('type')) {
                case 'array': return this.get_array_method(node,property)
                default: return undefined
            }

        }
        get_array_method(node,property) {
            switch (property) {
                case 'toJSON':
                    return () => [...node.childNodes]
                        .map((child, i) => this.getproperty(node, i.toString())
                    );
                case 'push':
                    return (value) => {
                        const index = node.childElementCount + 1
                        this.setproperty(node, index, value);
                    }
                case 'forEach':
                    return (F => {
                        for (let i = 0; i < node.childNodes.length; i++) {
                            F(this.getproperty(node, i), i,new Proxy(node, this.#handler))
                        }
                    })
                case 'every':
                    return (F =>
                        [...node.childNodes]
                            .every((v,i,a) => F(this.getproperty(node, i),i,new Proxy(node, this.#handler)))
                    )
                case 'some':
                    return (F =>
                        [...node.childNodes]
                            .some((v,i,a) => F(this.getproperty(node, i),i,new Proxy(node, this.#handler)))
                        )
                case 'reduce':
                    return ((F,P)  =>
                        [...node.childNodes]
                            .reduce((p,v,i,a) => F(p,this.getproperty(node, i),i,new Proxy(node, this.#handler)),P)
                        )
                case 'length':
                return node.childNodes.length
            }
        }
    }

    // create MC singleton
    const MC = new MControl()
    Object.defineProperty(MC, "Controller", {
        enumerable: true,
        configurable: false,
        writable: true,
        value: Controller
    });
    Object.defineProperty(MC, "Dynamic", {
        enumerable: true,
        configurable: false,
        writable: false,
        value: Dynamic
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
