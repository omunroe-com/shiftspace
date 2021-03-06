// ==Builder==
// @uiclass
// @package           ShiftSpaceCoreUI
// @dependencies      SSView, SSCell
// ==/Builder==

/*
  Constants:
    SSListViewError - base SSListView exception.
    SSListViewError.OutOfBounds - thrown when trying to access items out of bounds.
 */

var SSListViewError = SSException;

SSListViewError.OutOfBounds = new Class({
  Extends: SSListViewError,
  name:"SSListViewError.OutOfBounds"
});

/*
  Class: SSListView
  SSListView controls the display of an array or a SSTable (as an array) within the console.
*/
var SSListView = new Class({

  Extends: SSView,
  name: "SSListView",
    
  defaults: function()
  {
    return $merge(this.parent(), {
      cell: null,
      sortable: false,
      multipleSelection: false,
      horizontal: false,
      cellSize: null,
      filter: null,
      addAt: 'bottom',
      leaveEditOnUpdate: false,
      allowSelection: true,
      table: null,
      scrollEvents: false
    });
  },
  
  initialize: function(el, options)
  {
    this.parent(el, options);
    this.__cellBeingEdited = -1;
    this.__cellStates = {};
    if(this.options.filter) this.setFilter(this.options.filter);
    if(this.options.filterable) this.setFilterable(this.options.filterable);
    if(this.options.table)
    {
      SSLog('Use table', SSLogForce);
    }
    else
    {
      this.setData([]);
    }
    if(this.options.scrollEvents)
    {
      el.addEvent('scroll', this.onScroll.bind(this));
    }
    this.initSortables();
    this.attachEvents();
  },


  filterable: function()
  {
    return this.__filterable;
  },
  
  
  setFilterable: function(filterable)
  {
    this.__filterable = filterable;
    if(filterable)
    {
      var toggleFilter = $(this.element.getDocument().createElement("div"));
      this.element.grab(toggleFilter);
      toggleFilter.addClass("SSListViewFilterToggle");
      toggleFilter.addEvent("click", this.toggleFilter.bind(this));
    }
  },


  toggleFilter: function()
  {
    SSPostNotification("onToggleFilter", {listView:this});
  },

  
  /*
    Function: setState
      Set the internal list view state of a cell. This way state
      can be preserved between updates without polluting the actual
      data as well avoiding issues with sorting.
      
    Parameters:
      id - a document id.
      key - a string.
      v - a value.
  */
  setState: function(id, key, v)
  {
    if(!this.__cellStates[id]) this.__cellStates[id] = {};
    this.__cellStates[id][key] = v;
  },
  
  /*
    Function: getState
      Return the view state of a cell.
      
    Parameters:
      id - a document id.
      key - a string.

    Returns:
      A value.
  */
  getState: function(id, key)
  {
    return $get(this.__cellStates, id, key);
  },
  
  /*
    Function: removeState
      Remove a state for a cell.
      
    Parmeters:
      id - a document id.
      key - the key to delete.
  */
  removeState: function(id, key)
  {
    if($get(this.__cellStates, id, key)) delete this.__cellStates[id][key];
  },
  
  /*
    Function: states
      Return the current cell states.
      
    Parameters:
      
      
    Returns:
      A hash or an array
  */
  states: function(asArray)
  {
    if(asArray !== true) return this.__cellStates;
    return this.data().map(Function.comp(Function.acc("_id"), this.__cellStates.asFn()));
  },
  
  /*
    Function: setTable
      Set the table which will provide data to this list view.
      
    Parameters:
      table - a <SSTable> instance.
  */
  setTable: function(table)
  {
    if($type(table) == 'string')
    {
      SSAddObserver(this, 'tableSet', function(evt) {
        if(evt.name == table) this.__setTable__(evt.table);
      }.bind(this));
    }
    else
    {
      this.__setTable__(table);
    }
  },
  
  /*
    Function: __setTable__
      *private*
      Private setter for table property.  
  */
  __setTable__: function(table)
  {
    if(table === null)
    {
      this.setTableIsRead(false);
      this.__table = null;
      this.__reloadData__();
    }
    else
    {
      if(!$implements(table, SSTable.protocol))
      {
        SSLog("Argument to SSListView.__setTable__ does not implement SSTable.protocol", SSLogError);
        throw new Error();
      }
      if(!table.hasView(this)) table.addView(this);
      this.__table = table;
    }
  },
  
  /*
    Function: table
      Return the table that provides data to this list view.
      
    Returns:
      <SSTable>
  */
  table: function()
  {
    return this.__table;
  },
  
  /*
    Function: hasCell
      Check if the list view has a SSCell instance associated with it.
 
    Returns:
      boolean
   */
  hasCell: function()
  {
    if(this.__hasCell || this.cell()) return true;
    var node = this.element.getElement('> .SSCell');
    if(!node) return false;
    var controller = SSControllerForNode(node);
    this.__hasCell = (controller != null) && (!$memberof(controller.name, 'SSViewProxy'));
    if(this.__hasCell)
    {
      this.setCell(controller);
    }
    return this.__hasCell;
  },
  
  /*
    Function: setPageControl
      Set the page control object used by this list view.

    Parameters:
      pageControl - a page control object
   */
  setPageControl: function(pageControl)
  {
    this.__pageControl = pageControl;
  },
  
  /*
    Function: pageControl
      Return the page control object used by the list view

    Returns:
      A page control object.
   */
  pageControl: function()
  {
    return this.__pageControl;
  },
  
  /*
    Function: setFilter
      Sets the filter as a function.
      
    Parameters: 
      fn - A function.
      
    See Also: 
      <getFilter>, <filter>
  */  
  setFilter: function(fn)
  {
    this.__filter = fn;
  },
  
  /*
    Function: getFilter
      Returns the current filter.
      
    Returns: 
      A function.
      
    See Also: 
      setFilter
      filter
  */
  getFilter: function()
  {
    return this.__filter;
  },
  
  /*
    Function: filter
      Returns true if the filter is set. 
      
    Parameters: 
      data - a row in a javascript array. //NOTE:The name data is a bit ambigious. rowData maybe? -Justin
        
    Returns:
      A boolean value
    
    See Also:
      setFilter
      getFilter
  */
  filter: function(data, index)
  {
    var filterFn = this.getFilter();
    
    if(filterFn)
    {
      return filterFn(data, index);
    }
    return false;
  },
  
  /*
    Function: initSortables (private)
      Called during intialize(). Creates a new sortable object.
  */
  initSortables: function()
  {
    if(this.options.sortable)
    {
      // destroy any previous sortables
      if(this.__sortables)
      {
        this.__sortables.detach();
        delete this.__sortables;
      }
      
      var options = {
        constrain: true,
        clone: true,
        snap: 4,
        revert: true,
        opacity: 0.5,
        onStart: function(cellNode) 
        {
          this.setIsBeingSorted(true);
          this.__sortables.clone.addClass('DragClone');
          this.sortStart(cellNode);
        }.bind(this),
        onSort: this.sortSort.bind(this),
        onComplete: this.sortComplete.bind(this),
        onEnter: function()
        {
          
        },
        onLeave: function()
        {
          
        }
      };
      
      if(this.options.handle) options.handle = this.options.handle;
      this.__sortables = new Sortables(this.element, options);
    }
  },
  

  setIsBeingSorted: function(val)
  {
    this.__isBeingSorted = val;
  },
  

  isBeingSorted: function()
  {
    return this.__isBeingSorted;
  },
  
  /*
    Function: sortStart
      Sets the sortStart property to the index of a cell node. Determines the starting point for a sort.
                  
    Parameters:
      cellNode - a cell's DOM node
  */
  sortStart: function(cellNode)
  {
    this.__sortStart = this.indexOfCellNode(cellNode);
  },
  
  /*
    Function: sortSort (abstract)
      Sorts changed hooks.  
      
    Note: 
      This name needs to be change. sortChange?  -Justin
  */
  sortSort: function(cellNode)
  {
    this.__sortCurrent = this.indexOfCellNode(cellNode);
  },
  
  /*
    Function: sortComplete
      Calls the move function and sorts an array from sortStart to the passed cell node.
      
    Parameters:
     cellNode - a cell's DOM node. Determines where the sort ends. 
     
    See Also:
      move
  */
  sortComplete: function(cellNode)
  {
    this.setIsBeingSorted(false);
    this.__sortEnd = this.indexOfCellNode(cellNode);
    
    this.fireEvent('onSortComplete');
    
    if(this.__sortStart != undefined &&
       this.__sortEnd != undefined &&
       this.__sortStart != this.__sortEnd)
    {
      this.fireEvent('onOrderChange', {
        listView: this, 
        start: this.__sortStart, 
        end: this.__sortEnd
      });
    }
    
    // clear the state vars
    this.__sortStart = undefined;
    this.__sortCurrent = undefined;
    this.__sortEnd = undefined;
  },
  
  /*
    Function: attatchEvents (private)
      Called by the initialize function.  Adds an event that calls eventDispatch on a click event. 
  */
  attachEvents: function()
  {
    this.element.addEvent('click', this.eventDispatch.bind(this));
  },
  
  /*
    Function: eventDispatch (private)
      Called on click event. 
  
    Parameters:
      _event - the event issueing the function. Always a "click" event. 
      eventType - //NOTE: I'm not sure what this argument means. -Justin
  */
  eventDispatch: function(event, eventType)
  {
    event = new Event(event);

    var target = $(event.target),
        type = event.type;
    
    switch(true)
    {
      case(this.hitTest(target, 'li, > li *') != null):
        var hit = this.cachedHit(),
            cellNode = (hit.get('tag') == 'li' && hit) || hit.getParent('li');
        this.cell().lock($(cellNode));
        var handled = this.cell().eventDispatch(event, type);
        this.cell().unlock();
        if(type == 'click')
        {
          if(!handled) this.onRowClick(this.indexOfCellNode(cellNode));
        }
      break;
      
      default:
      break;
    }
  },

  /*
    Function: awake
      If a cell has content, set the cell's content to the assigned context.
      
    Parameters:
      context - The context a object was created for. Either a window, element, or iframe.
  */
  awake: function(context)
  {
  },
  
  
  afterAwake: function(context)
  {
    var cellNode = this.element.getElement('> .SSCell');
    if(cellNode)
    {
      this.setCell(SSControllerForNode(cellNode));
    }
  },
  
  /*
    Function: setCell
      Sets the cell object, and sets a delegate instance of the cell. 

    Parameters:
      cell - A cell object.
        
    See also:
      <cell>
  */
  setCell: function(cell)
  {
    this.__cell = cell;
    cell.setDelegate(this);
    cell.element.dispose();
  },
    
  /*
    Function: cell
      Returns the cell object.

    Returns:
      A cell ojbecct
        
    See also:
      <setCell>
  */  
  cell: function()
  {
    return this.__cell;
  },


  filterMode: function()
  {
    return this.__filterMode;
  },
  
  
  setFilterMode: function(filterMode)
  {
    this.__filterMode = filterMode;
  },


  /*
    Function: setData
      Sets the data property of the class. 
    
    Parameters:
      newData - A javascript array row.
    
    See Also:
      data
  */
  setData: function(newData)
  {
    this.__data = newData;
    this.setNeedsDisplay(true);
  }.future(),
    
  /*
      Function: data
        Returns the data property.
      
      Returns:
        A javascript array row.

      See Also:
        setData
  */
  data: function()
  {
    if(this.table() && !this.filterMode())
    {
      return this.table().data();
    }
    else
    {
      return this.__data;
    }
  },
  
  /*
    Function: count
    //NOTE: See TODO in function. -Justin  
         
    Returns:
      The length of a row in a Javascript array. 
  */
  count: function()
  {
    return this.data().length;
  },
  
  /*
    Function: find
      Returns a 0 if a row in a raw data array is found in a passed function, otherwise returns -1.
        
    Parameters:
      fn - A function
        
    Returns:
      An integer 
        
    See Also:
      <findAll>
  */
  find: function(fn)
  {
    var data = this.data();
    for(var i = 0, l = data.length; i < l; i++) if(fn(data[i])) return i;
    return -1;
  },
  
  /*
    Function: findAll
      Returns an array containing all of the found raw data rows in a passed function. 
      
    Parameters:
      fn - A function
        
    Returns:
      An array
    
    See Also:
      <find>   
  */
  findAll: function(fn)
  {
    var data = this.data(),
        result = [];
    for(var i = 0, l = data.length; i < l; i++) if(fn(data[i])) result.push(data[i]);
    return result;
  },
  
  /*
    Function: query
      Accepts an index of a collection item and argument to search for in a function. Returns the argument value(s) in a string or array, othewise returns null. 
      
    Parameters:
      index - the index of a SSCell object
      arg   - An argument of a function. 
        
    Returns:
      An string, array or null.
  */
  query: function(index, arg)
  {
    if($type(arg) == 'string') return this.get(index)[arg];
    if($type(arg) == 'array')
    {
      var data = this.get(index);
      var result = {};
      arg.each(function(prop) {
        result[prop] = data[prop];
      });
      return result;
    }
    return null;
  },
  
  /*
    Function: cellNodes
      Returns all the listed cell nodes of an element.
      
    Returns:
      A group of list elements
  */
  cellNodes: function()
  {
    return this.element.getElements('> li');
  },
  
  /*
    Function: add
      Adds an object, that is specified with the newItem argument, to a collection. The _animate argument determines if an animation occurs during function call.
        
    Parameters:
      newItem  - a javascript object
      options - an object, can contain animate boolean as well as atIndex value.
  */
  add: function(newItem, options)
  {
    var animate = ((!options || options.animate == null) && true) || options.animate,
        delegate = this.delegate(),
        canAdd = (delegate && delegate.canAdd && delegate.canAdd(this)) || true;
    if(canAdd)
    {
      var addData = (delegate && delegate.dataFor && delegate.dataFor('add', this));
      if(this.options.addAt == 'bottom') this.data().push(newItem);
      if(this.options.addAt == 'top') this.data().unshift(newItem);
      this.refresh();
    }
  },
  
  /*
    Function: onAdd (private)
      Callback event when a new Item is added to a collection. 
    
    Parameters:
      data - A row in a javascript array.
  */
  onAdd: function(data, userData)
  {
    if(this.cellBeingEdited() != -1) this.cancelEdit(this.cellBeingEdited(), false);
    var filtered = false;
    if(userData && userData.atIndex != null) filtered = this.filter(data, userData.atIndex);
    var delegate = this.delegate(),
        anim = (!filtered &&
                delegate &&
                delegate.animationFor && 
                delegate.animationFor({action:'add', listView:this, userData:data})) || false;
    if(anim)
    {
      var animData = anim();
      animData.animation(function() {
        if(animData.cleanup)
        {
          animData.cleanup();
        }
        this.refresh(true);
      }.bind(this));
    }
    else
    {
      this.refresh(true);
    }
    
    this.fireEvent('onAdd', data);
  },
  
  /*
    Function: addObject
      Adds an object to a collection. The sender argument specifies the object to add. Intended to be used for event handling.
      
    Parameters:
      sender -  An HTML element. (SSCell)
      
    See Also:
      add
  */
  addObject: function(sender, options)
  {
    this.add(sender.dataForNewItem(), options);
  },
  
  /*
    Function: edit
      Accepts the index of a cell in a collection and allows it to be edited (if permitted). The _animate argument determines if an animation occurs during function call.
      
    Parameters:
      index - the index of a SSCell object. 
      _animate - A boolean value.
  
  */
  edit: function(index, _animate)
  {
    var animate = (_animate == null && true) || _animate,
        delegate = this.delegate(),
        canEdit = (delegate && delegate.canEdit && delegate.canEdit(index)) || true;
    
    if(canEdit)
    {
      if(!this.options.multipleSelection && this.cellBeingEdited() != -1)
      {
        animate = false;
        this.cancelEdit(this.cellBeingEdited(), false);
      }
      
      var anim = (animate && 
                  delegate && 
                  delegate.animationFor && 
                  delegate.animationFor({action:'edit', listView:this, index:index})) || false;
      
      var editModeForCell = function() {
        this.setCellBeingEdited(index);
        this.cell().lock(this.cellNodeForIndex(index));
        this.cell().edit();
        this.cell().unlock();
      }.bind(this);
      
      if(anim)
      {
        var animData = anim();
        animData.animation().chain(function() {
          if(animData.cleanup) animData.cleanup();
          editModeForCell();
        }.bind(this));
      }
      else
      {
        editModeForCell();
      }
    }
  },
  
  /*
    Function: get 
      Accepts an index of cell in a collection. Retreives the properties of each 
      data element, stores them in an array, and returns the array. 
      
    Parameters:
      index - the index of a SSCell object. 
      
    Returns: 
      An array. 
  */
  get: function(indexOrIndices)
  {
    var result = $splat(indexOrIndices).map(this.__get__.bind(this));
    return ($type(indexOrIndices) == "array") ? result : result[0];
  },
  
  /*
    Function: get (private)
     Accepts the index of cell in a colletion and calls the returns the cells data in an array.
     
    Parameters: 
      index - the index of a SSCell object.
      
    Returns:
      An array
      */
  __get__: function(index)
  {
    if(this.data().get)
    {
      return this.data().get(index);
    }
    else
    {
      return this.data()[index];
    }
  },
  
  /*
    Function: update  
      Updates a collection's content with the passed cellData at the specified index. Accepts the current data, the index of the collection to update, and whether 
    
    Parameters:
      cellData - An object.
      index - the index of a SSCell object
      _noArrayUpdate - A boolean.
  */
  update: function(cellData, index, _noArrayUpdate)
  {
    var noArrayUpdate = _noArrayUpdate || false,
        delegate = this.delegate(),
        canUpdate = (delegate && delegate.canUpdate && delegate.canUpdate(index)) || true;
    if(canUpdate)
    {
      if(!noArrayUpdate) this.__update__(cellData, index);
      this.onUpdate(index);
    }
    if(this.options.leaveEditOnUpdate)
    {
      var canLeaveEdit = (this.canLeaveEdit && this.canLeaveEdit(index)) || true;
      if(canLeaveEdit) this.cell().leaveEdit();
    }
  },
  
  /*
    Function: updateObject 
      Accepts a SSCell object in a collection and updates it.
      
    Parameters:
      sender -  An HTML element. (SSCell)
  */
  updateObject: function(sender)
  {
    var index = this.indexOf(sender);
    this.update(this.cell().getAllData(), index);
  },
  
  /*
    Function: updateCellView 
      Accepts a cell's index in a collection array, and updates the cell's view with new cell data. 
      
    Parameters: 
      cellData - An Object.
      index - the index of a SSCell object.
  */
  updateCellView: function(cellData, index)
  {
    this.cell().lock(this.cellNodeForIndex(index));
    this.cell().setData(cellData);
    this.cell().unlock();
  },
  
  /*
    Function: __update__ (private)
      Accepts cell data and a cell's index. Merges the new cell data with the existing data of a specified cell in a collection.
        
    Parameters: 
      cellData - An Object. 
      index - the index of a SSCell object. 
      
  */
  __update__: function(cellData, index)
  {
    var oldData = this.data()[index];
    this.__set__($merge(oldData, cellData), index);
  },
  
  /*
    Function: onUpdate 
      Accepts the index of cell in a collection, checks if an animaton should be applied, and refreshes it.
    
    Parameter: 
      index - the index of a SSCell object. 
      
    //NOTE: animation support to be implemented -Justin
  */
  onUpdate: function(index)
  {
    var delegate = this.delegate(),
        anim = (delegate && 
                delegate.animationFor && 
                delegate.animationFor({action:'update', listView:this, index:index})) || false;
    if(anim)
    {
      anim().chain(this.refresh.bind(this));
    }
    else
    {
      this.refresh();
    }
  },
  
  /*
    Function: set
      Accepts cell data and a cell index, and applies the data to the specified cell after performing a bounds check.
      
    Parameters: 
      cellData - An object. 
      index - the index of a SSCell object.
  */
  set: function(cellData, index)
  {
    this.__set__(cellData, index);
  },
  
  /*
    Function: __set__ (private)
      Accepts cell data and a cell index, and applies the data to the specified cell.
    
    Parameters: 
      cellData - An object. 
      index - the index of a SSCell object.
  */
  __set__: function(cellData, index)
  {
    this.data()[index] = cellData;
  },
  
  /*
    Function: remove
      Accepts an cell index, and removes the cell from the collection
      
    Parameter:
      index - the index of a SSCell object.
      
    See Also:
      removeObject
      
    //NOTE: ability to remove a cell with and without using collections needs to be redesigned.
  */
  // TODO: animation support
  remove: function(index)
  {
    var delegate = this.delegate(),
        canRemove = true;
    if(delegate && delegate.canRemove) canRemove = delegate.canRemove({listView:this, index:index});
    if(canRemove) this.__remove__(index);
  },
  
  /*
    Function: __remove__ (private)
      Accepts a cell's index and removes it from the array.
      
    Parameters:
      index - the index of a SSCell object. 
  */
  __remove__: function(index)
  {
    this.data().splice(index, 1);
    this.refresh(true);
  },
  
  /*
    Function: removeObject
      Accepts a cell element and removes it from a collection.
    
    Parameters:
      sender -  An HTML element. (SSCell)
      
    See Also:
      remove
  */
  removeObject: function(sender)
  {
    var index = this.indexOf(sender);
    this.remove(index);
  },
  
  /*
    Function: onRemove (private)
      Checks to see if an animation should be applied after removing a cell, and then calls refresh.
    
    Parameters:
      index - the index of a SSCell object.
      
    //NOTE: animation support to be implemented -Justin
  */
  onRemove: function(index)
  {
    var delegate = this.delegate(),
        anim = (delegate && 
                delegate.animationFor && 
                delegate.animationFor({action:'remove', listView:this, index:index})) || false;
    if(index == this.cellBeingEdited()) this.setCellBeingEdited(-1);
    if(anim)
    {
      var animData = anim();
      animData.animation().chain(function() {
        if(animData.cleanup) animData.cleanup();
        this.refresh();
      }.bind(this));
    }
    else
    {
      this.refresh();
    }
    this.fireEvent('onRemove', index);
  },
  
  removeMultiple: function(indices)
  {
    
  },
  
  /*
    Function: editObject
      Accepts a cell element and allows that cell to be edited.
    
    Parameters:
      sender -  An HTML element. (SSCell)
  */
  editObject: function(sender)
  {
    var index = this.indexOf(sender);
    this.edit(index);
  },
  
  /*
    Function: hideItem
      Hides the specified cell within a collection, and checks to see if animation should occur during hiding. Calls the refresh function to perform filtering of hidden items. Accepts a cell index and a boolean that determines whether animation occurs.  
    
    Parameters:
      index - the index of a SSCell object.
      _animate - A boolean.
  */
  hideItem: function(index, _animate)
  {
    var animate = (_animate == null && true) || _animate,
        delegate = this.delegate(),
        canHide = (delegate && delegate.canHide && delegate.canHide(index)) || true;

    if(canHide)
    { 
      var anim = (animate && delegate && delegate.animationFor && delegate.animationFor({action:'hide', listView:this, index:index})) || false;
      
      if(anim)
      {
        var animData = anim();
        animData.animation().chain(function() {
          if(!this.suppressRefresh()) this.refresh();
          if(animData.cleanup) animData.cleanup();
        }.bind(this));
      }
      else
      {
        this.refresh();
      }
    }
  },
  
  /*
    Function: hideObject
      Accepts a cell object and hides it by passsing it to hideItem
    
    Parameters:
      sender -  An HTML element. (SSCell)
    
    See Also:
      hideItem
    
    //NOTE:  Shouldn't this function have an _animate parameter?  -Justin
  */
  hideObject: function(sender)
  {
    var index = this.indexOf(sender);
    this.hideItem(index);
  },

  /*
    Function: checkForUnsavedChanges 
      //Note: Needs work  
  */
  checkForUnsavedChanges: function(properties)
  {
    // grab the old values
    return false;
  },

  /*
    Function: cancelEdit
      Cancels Accepts a cell index and a boolean that determines if animation occurs.
      
    Parameters:
      index - the index of a SSCell object.
      _animate - A boolean.
  */
  cancelEdit: function(index, _animate)
  {
    var animate = (_animate == null && true) || _animate,
        cellBeingEdited = this.cellBeingEdited(),
        delegate = this.delegate(),
        canLeaveEdit = (delegate && delegate.canLeaveEdit && delegate.canLeaveEdit(index)) || true;

    // check for unsaved changes
    if(cellBeingEdited != -1 && canLeaveEdit)
    {
      var anim = (animate && delegate && delegate.animationFor && delegate.animationFor({action:'leaveEdit', listView:this, index:index})) || false;
      
      var leaveEditModeForCell = function() {
        this.cell().lock(this.cellNodeForIndex(cellBeingEdited));
        this.cell().leaveEdit();
        this.cell().unlock();
        this.setCellBeingEdited(-1);
      }.bind(this);
      
      if(anim)
      {
        var animData = anim();
        animData.animation().chain(function() {
          leaveEditModeForCell();
          if(animData.cleanup) animData.cleanup();
        }.bind(this));
      }
      else
      {
        leaveEditModeForCell();
      }
    }
  },
  
  /*
    Function: cancelEditObject
      Cancels edits to a passed SSCell object.
      
    Parameters:
      sender -  An HTML element. (SSCell)
      
    See Also:
      cancelEdit
      
    //NOTE:  Shouldn't this function have an _animate parameter to send to cancelEdit?  -Justin
  */
  cancelEditObject: function(sender)
  {
    var index = this.indexOf(sender);
    this.cancelEdit(index);
  },
  
  /*
    Function: canSelect
      Checks the delagate of a cell specified by the index argument.  If a delegate exists, it returns whether the cell is set as selectable. Returns true by default.
      
    Parameters:
      index - the index of a SSCell object.
      
    Returns:
      An Boolean
  */
  canSelect: function(index)
  {
    if(this.delegate() && this.delegate().canSelect)
    {
      return this.delegate().canSelect(index);
    }
    return true;
  },
  
  /*
    Function: refresh
      Checks to see if refresh can be called, and calls reloadData. Setting the force paremeter to true bypasses the initial checks.
      
    Parameters:
      force - A Boolean.
  */
  refresh: function(force)
  {
    this.parent();
    if(force && this.table()) this.setTableIsRead(false);
    var hasCell = this.hasCell();
    if(!hasCell) return;
    if(!this.data() && !this.table()) return;
    if(!this.isVisible()) return;
    this.reloadData();
  },
  
  
  show: function()
  {
    this.parent();
    if(this.cell() && 
       this.cellNodes().length == 0 && 
       this.data() &&
       this.data().length > 0)
    {
      this.reloadData();
    }
  },
  
  /*
    Function: newCellForItemData
    
    Parameters:
      itemData - a JSON object
      index - the index of item to make sure it's not filtered

    Returns:
      a cloned DOM node from the list view's SSCell instance
   */
  newCellForItemData: function(itemData, index)
  {
    var filtered = this.filter(itemData, index),
        newCell = this.cell().cloneWithData(itemData, index);
    if(filtered) newCell.addClass('SSDisplayNone');
    return newCell;
  },
  
  
  setTableIsRead: function(val)
  {
    this.__tableIsRead = val;
  },
  
  
  tableIsRead: function()
  {
    return this.__tableIsRead;
  },
  
  /*
    Function: reloadData
      Called by refresh(). Calls private  __reloadData__ which actually does
      the work. If the list view data source is an SSTable instance will
      call SSTable's read method which returns a promise.

    See Also:
      SSTable
  */
  reloadData: function()
  {
    var table = this.table(), controlp;
    if(table && !this.tableIsRead())
    {
      this.setTableIsRead(true);
      controlp = table.read();
    }
    this.__reloadData__(controlp);
  },
  
  /*
    Function: __reloadData__ (private)
      Clears out all of the cells and reloads data directly from the
      list view's data source. Fires 'onReloadData' data event.

    Parameters:
      p - a control promise.
   */
  __reloadData__: function(p, startIndex)
  {
    var theData = this.data(), len = theData.length, cell = this.cell();
    if(!$type(startIndex))
    {
      this.element.getElements("li:not(.SSPreserve)").destroy();
    }
    if(len > 0 && cell)
    {
      if(this.options.preserveBottom)
      {
        var otherEls = this.element.getElements(".SSPreserve").map(function(x) {
          return x.dispose();
        });
      }
      var perPage = (this.pageControl() && this.pageControl().perPage()) || len;
      if(this.options.horizontal && this.options.cellSize)
      {
        var modifer = (this.options.cellModifier && this.options.cellModifier.x) || 0;
        this.element.setStyle('width', (this.options.cellSize.x*perPage)+modifer);
      }
      theData.slice(startIndex || 0, len).each(function(data, i) {
        var cellNode = this.newCellForItemData(data, i);
        this.element.grab(cellNode);
        var restore = this.__cellStates[data._id];
        if(restore)
        {
          cell.lock(cellNode);
          $H(restore).each(Function.exec);
          cell.unlock();
        }
        this.onAddCellNode(cellNode);
      }, this);
      if(this.options.preserveBottom && otherEls)
      {
        otherEls.each(function(x) {
          this.element.grab(x);
        }.bind(this));
      }
      this.setNeedsDisplay(false);
      this.initSortables();
    }
    if(this.pageControl()) this.pageControl().initializeInterface();
    this.fireEvent('onReloadData', this);
    this.onReloadData();
  }.future(),
  
  /*
    Function: onReloadData
      *abstract*
      Called when list view reloads data. Subclasses can implement to add new behaviors.
  */
  onReloadData: function() {},
  
  /*
    Function: onAddCellNode
      *abstract*
      Called each time a list item is added during the __reloadData__ phase.
      
    Parameters:
      cellNode - a DOM Element.
  */
  onAddCellNode: function(cellNode) {},
  
  /*
    Function: cellNodeForIndex
      Returns the SSCell object based on the passed index parameter.
    
    Parameters: 
      index - the index of a SSCell object.
  */
  cellNodeForIndex: function(index)
  {
    return this.cellNodes()[index];
  },
  
  /*
    Function: indexOf
      Returns the index of a SSCell object that contains the passed object. If the object is not found in a SSCell, it returns -1.
    
    Parameters:
      object - An object.
      
    Returns:
      A cell node index or -1.
  */
  indexOf: function(object)
  {
    if($memberof(object, 'SSCell'))
    {
      return this.indexOfCellNode(object.lockedElement());
    }
    return -1;
  },
  
  /*
    Function: indexOfCellNode 
      Returns the index of the passed cell node.
    
    Parameter:
      cellNode - a cell's DOM node
      
    Returns:
      The index of a cell node
      
  */
  indexOfCellNode: function(cellNode)
  {
    return this.indexOfNode(this.cellNodes(), cellNode);
  },

  /*
    Function: dataForIndex
      Return the data for the specified index.
      
    Parameters:
      idx - an integer.
      
    Returns:
      A value.
  */
  dataForIndex: function(idx)
  {
    return this.data()[idx];
  },

  /*
    Function: dataForCellNode
      Return the data for a particular cell node.
      
    Parameters:
      cellNode - an element.
      
    Returns:
      A value.
  */
  dataForCellNode: function(cellNode)
  {
    return this.data()[this.indexOfCellNode(cellNode)];
  },
  
  /*
    Function: onCellClick 
      Accepts a cell node and calls onRowClick.
      
    Parameter:
      cellNode - A cell's DOM node
      
    See Also:
      onRowClick
  */
  onCellClick: function(cellNode)
  {
    var index = this.indexOfNode(this.cellNodes(), cellNode);
    this.onRowClick(index);
  },

  
  onRowClick: function(index)
  {
    if(this.options.allowSelection)
    {
      var cellNode = this.cellNodeForIndex(index);
      if(!cellNode.hasClass('selected')) 
      {
        this.selectRow(index);
      }
      else
      {
        this.deselectRow(index);
      }
    }
  },


  onRowSelect: function(index) {},
  selectRow: function(index)
  {
    var cellNode = this.cellNodeForIndex(index);
    if(!this.options.multipleSelection) this.cellNodes().removeClass('selected');
    if(!cellNode.hasClass('selected')) 
    {
      var event = {
        listView: this,
        index: index,
        data: this.dataForIndex(index)
      };

      cellNode.addClass('selected');
      this.onRowSelect(index);
      this.fireEvent("onRowSelect", event);
    }
  },
  

  onRowDeselect: function(index) {},
  deselectRow: function(index)
  {
    var cellNode = this.cellNodeForIndex(index);
    if(!this.options.multipleSelection) this.deselectAll();
    if(cellNode.hasClass('selected')) 
    {
      var event = {
        listView: this,
        index: index,
        data: this.dataForIndex(index)
      };

      cellNode.removeClass('selected');
      this.onRowDeselect(index);
      this.fireEvent("onRowDeselect", event);
    }
  },


  deselectAll: function()
  {
    this.cellNodes().removeClass('selected');
  },
  
  
  selectedRows: function()
  {
    return this.element.getElements("> li.selected").map(this.indexOfCellNode.bind(this));
  },
  
  /*
    Function: setCellBeingEdited
      Accepts an index of a cell, and sets the __cellBeingEdited property value to that index.  Used to identify which cell is currently being edited by a user.
      
    Parameters:
      index - the index of a SSCell object.
  */
  setCellBeingEdited: function(index)
  {
    this.__cellBeingEdited = index;
  },

  /*
    Function: cellBeingEdited
      Returns the __cellBeingEdited property value.
  */
  cellBeingEdited: function()
  {
    return this.__cellBeingEdited;
  },

  /*
    Function: setNeedsDisplay
      Sets whether the display should be set for the ListView content.  When set to true, the SSListView is cleared.
      
    Parameter: 
      value - A boolean value.
  */
  setNeedsDisplay: function(value)
  {
    this.parent(value);
    if(value && this.element && this.cell() && !this.isVisible())
    {
      this.element.getElements("li").destroy();
    }
  },

  /*
    Function: animate
      Returns an animation Promise.
   */
  animate: function(event)
  {
  },
  
  /*
    Function: onScroll
      *private*
      Called on scroll event if the list view was created with the scrollEvents
      initialize option set to true.
  */
  onScroll: function()
  {
    var scroll = this.element.getScroll(),
        scrollSize = this.element.getScrollSize(),
        size = this.element.getSize();
    if(scroll.y == 0) this.onScrollTop();
    if(scrollSize.y == (scroll.y + size.y)) this.onScrollBottom();
  },
  
  /*
    Function: onScrollTop
      *abstract*
      Called when the list view is scrolled to the top.
  */
  onScrollTop: function(evt) {},
  
  /*
    Function: onScrollBottom
      *abstract*
      Called when the list view is scrolle to the bottom.
  */
  onScrollBottom: function(evt) {}
});