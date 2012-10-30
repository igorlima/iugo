window['$iugo'] = {};
$iugo.$internals = {};
/** Apply top level getter and setter to each member of the model
 * This is different from the deep getters/setters in that it triggers a refresh of the view
 * The view must be refreshed at this level only as the viewcontrollers may use other parts of the model in calculations
 */
$iugo.$internals.registerModelMember = function(obj, prop) {
    Object.defineProperty(obj, prop, {
        get: function() {
        	return this.$[prop];
        },
        set: function(value) {
        	this.updateView(prop, value);
			this.$[prop] = value;
			$iugo.$internals.applySetters(value, this, [prop], value);
        }
    });
};
/**
 * Apply traverse the model looking for members to apply setters to
 * the setters are applied in a different method in order to create a closure
 */
$iugo.$internals.applySetters = function(obj, mvvc, props, modelMember) {
	if (obj instanceof Object || obj instanceof Array) {
		for (var nextLevelField in obj) {
			$iugo.$internals.registerProperty(obj, nextLevelField, mvvc, props)
			var newProps = props.concat([nextLevelField]);
			$iugo.$internals.applySetters(obj[nextLevelField], mvvc, newProps, modelMember);
		}
		
		if (obj instanceof Array) {
			// override push and pop variants
			$iugo.$internals.registerArray(obj, mvvc, props);
		}
	}
};
/**
 * Apply a getter and setter to a deep property
 * a reference to the original mvvc object and the path to the current level in that object are always maintained
 * this allows the method to retrieve the original value from the "Dollar" field and to trigger an update on the mvvc object
 */
$iugo.$internals.registerProperty = function(obj, field, mvvc, path) {
	mvvc.$[path.concat([field]).join('.')] = obj[field];
	obj.__defineSetter__(field, function(value) {
		mvvc.$[path.concat([field]).join('.')] = value;
		// as the setter is already defined we can just update the view
		// as opposed to pushing to an array where a reset of the model member is required
		// NB. if this were a full update (mvvc[path[0]] = mvvc[path[0]]) an infinite loop would be generated when pushing to an array
		mvvc.updateView(path[0], mvvc[path[0]]);
	})
	obj.__defineGetter__(field, function() {
		return mvvc.$[path.concat([field]).join('.')];
	})
};
/**
 * The array itself already has a setter (so changing it for another array will update the view)
 * however the element arr[n+1] will not have a setter to adding a new element will not trigger an update to the view
 * NB. the case where one adds the element arr[n+m] : m > 1, there will still be no update to the model - without adding setters blindly this will probably be a limitation that I have to live with. CMS
 */
$iugo.$internals.registerArray = function(arr, mvvc, path) {
	// Override the default mutating array methods to trigger model updates after mutation
	arr.push = function() {
		var retVal = Array.prototype.push.apply(this, arguments);
		mvvc[path[0]] = mvvc[path[0]];
		return retVal;
	}
	arr.pop = function() {
		// The return value must be cloned or it will be linked to arr[n] - which will change after the pop
		var retVal = $iugo.$internals.clone(Array.prototype.pop.call(arr));
		mvvc[path[0]] = mvvc[path[0]];
		return retVal;
	}
	arr.unshift = function() {
		var retVal = Array.prototype.unshift.apply(this, arguments);
		mvvc[path[0]] = mvvc[path[0]];
		return retVal;
	}
	arr.shift = function() {
		// The return value must be cloned or it will be linked to arr[0] - which will change after the shift
		var retVal = $iugo.$internals.clone(Array.prototype.shift.call(this));
		mvvc[path[0]] = mvvc[path[0]];
		return retVal;
	}
	arr.sort = function() {
		var retVal = Array.prototype.sort.apply(this, arguments);
		mvvc[path[0]] = mvvc[path[0]];
		return retVal;
	}
	arr.splice = function() {
		var retVal = Array.prototype.splice.apply(this, arguments);
		mvvc[path[0]] = mvvc[path[0]];
		return retVal;
	}
};
/**
 * A simple deep clone method.
 * There are multiple cases where using an object by reference causes infinite recursion due to the setters
 */
$iugo.$internals.clone = function(obj) {
	var clone = {};
	for (var i in obj) {
		if(obj[i] instanceof Object || obj[i] instanceof Array)
			clone[i] = $iugo.$internals.clone(obj[i]);
		else
			clone[i] = obj[i];
	}
	return clone;
};
/**
 * Main MVVC constructor
 * NB. this is aliased by the Iugo Function
 */
$iugo.$internals.MVVC = function(model, view, viewcontroller) {
	this.view = (view) ? view : document.body;
	this.viewcontroller = (viewcontroller) ? viewcontroller : {};
	for (var x = 0; x < this.initializers.length; x++ ) {
		if (this.initializers[x] instanceof Function) {
			this.initializers[x](this.view);
		}
	}
	// Lastly set the model
	this.model = model;
};
$iugo.$internals.MVVC.prototype = {
	// The "Dollar" field holds references to all members and sub-members of the model, without any getters or setters
    "$": {},
    // Prototypal setter for the top level model. I.E how you define a model
    set model(model) {
        for (var member in model) {
            $iugo.$internals.registerModelMember(this, member);
            this[member] = model[member];
        }
    },
    // Trigger the view to update
    updateView: function(prop, value) {
		if (typeof(this.viewcontroller[prop]) !== 'undefined' && this.viewcontroller[prop] instanceof Function) {
			this.viewcontroller[prop](value);
		}
		for (var x = 0; x < this.defaultViewcontrollers.length; x++) {
			if (this.defaultViewcontrollers[x] instanceof Function) {
				this.defaultViewcontrollers[x](prop, value, this.view);
			}
		}
    },
    // The deafultViewcontrollers and initializers are added as plugins
    "defaultViewcontrollers": [],
    "initializers": []
};
/*
 * This is the "public" view on the framework
 *
 * Usage:
 *		var product = new Iugo({
 *			skuNumber: 0,
 *			manufacturer: {
 *				name: "Default Manufacturer",
 *				code: "001",
 *				vatNumber: ""
 *			},
 *			productName: "",
 *			description,
 *			stockests: []
 *		});
 *
 *		product.productName = "Foo";
 *
 * By default the view is document.body, but any part of the DOM tree can be used
 * 
 * The viewcontroller is an associative array which mirrors the top-level members of the model,
 * for each member, the viewcontroller hold a function which will be executed upon update.
 * By default this is an empty object which leaves processing to pluigns via the defaultViewcontroller stack
 */
window["Iugo"] = function(model, view, viewcontroller) {
    return new $iugo.$internals.MVVC(model, view, viewcontroller);
};