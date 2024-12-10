/*
  TODO:
  - Should insufficient funds/reserve be thrown from domain rather than app?
  - re-open doesn't work after close
  - be consistent about naming keys vs actual SharedObjects
  - show reserves in group display
  - stipend
  - widthraw
  - invest, including accounting data
  - vote
  - user menu
  - disable twist down a group you are not in
  - genericize (including, dynamically add group-based css and populating users)
 */

class App extends ApplicationState {
  // These are called when their key's value is changed, and are used to set things up to match the change.
  section(state) {
    subtitle.textContent = state;
    if (state === 'pay') setTimeout(updatePaymentCosts);
  }
  group(state) {
    let name = Group.get(state)?.name || 'pick one';
    paymeCurrency.textContent = name;
    fromCurrency.textContent = name;
    // Note that WE are asking OTHERS to pay us in our currently chosen group. Compare paying others in their currency.
    updateQRDisplay({payee: this.pending.user || this.states.user, currency: state, imageURL: userButton.querySelector('img').src});
    if (state) document.getElementById(state).scrollIntoView();
  }
  groupFilter(state) { // Set the toggle.
    if (groupFilter.checked === !!state) return;
    groupFilter.click();
  }
  payee(state) { // Set the text.
    payee.textContent = User.get(state).name;
  }
  currency(state) { // The target group for a payment to someone else.
    const {name} = Group.get(state).name;
    currencyExchanged.textContent = currency.textContent = Group.get(state).name;;
  }
  user(state) {  // Set the images, switch user options, and qr code.
    const {name, img} = User.get(state),
	  picture = `images/${img}`,
	  fixmeOther = localPersonas[(localPersonas.indexOf(state)+1) % localPersonas.length];
    currentUserName.textContent = name;
    userButton.querySelector('img').src = picture;
    fixmeOtherUser.textContent = User.get(fixmeOther).name; fixmeOtherUser.dataset.href = fixmeOther;
    updateQRDisplay({payee: state, currency: this.pending.currency || this.states.currency, imageURL: picture});
    document.querySelector('ul[data-mdl-for="paymentButton"]').innerHTML = '';
    document.querySelector('ul[data-mdl-for="fromCurrencyButton"]').innerHTML = '';
    for (const groupElement of groupsList.children) {
      const key = groupElement.id,
	    group = Group.get(key);
      if (!group) continue; // e.g., a template
      const groupUserData = group.people[state],
	    isMember = groupUserData && !groupUserData.isCandidate,
	    checkbox = groupElement.querySelector('expanding-li label.mdl-checkbox');
      updateGroupBalance(groupElement, groupUserData?.balance);
      setTimeout(() => checkbox.MaterialCheckbox[isMember ? 'check' : 'uncheck']()); // Silly, but needs time.
      if (isMember) {
	fillCurrencyMenu(key, group.name, 'ul[data-mdl-for="paymentButton"]'); // For receiving menu.
	fillCurrencyMenu(key, group.name, 'ul[data-mdl-for="fromCurrencyButton"]'); // For receiving menu.
      }
    }
  }

  // Internal app machinery:

  // Each html section is styled as display:none by default, but have more specific css that turns a section on
  // if the body has a css class that matches that section. By adding one such section class at a
  // time to the body, we can make exactly one section visible without modifying the dom. (This is much more
  // efficient than re-generating each section all the time.) Similarly for the other keys other than section.
  stateChanged(key, old, state) {
      if (!this.unstyled.includes(key)) {
      const classList = document.body.classList;
      if (old) classList.remove(old); // Subtle: can remove('nonexistent'), but remove('') is an error.
      if (state) classList.add(state);
    }
    this.updateURL(key, state); // Make the internal url reflect state. Used by save().
  }
  // These two are tracked, but we do not add/remove classes for their values (which are from the same set as user & group).
  unstyled = [ 'payee', 'currency' ];

  // Local application state is saved, um, locally.
  save() { // Persist for next session, and update browser history, too.
    const string = JSON.stringify(this.states),
	  href = this.url.href;
    localStorage.setItem('localState', string);
    if (href !== location.href) history.pushState(this.states, document.title, href);
  }
  retrieve() { // Get saved state.
    let string = localStorage.getItem('localState');
    return string ? JSON.parse(string) : {groupFilter: 'allGroups', user: 'alice'};
  }
  // The forward/back buttons and the browser history all work, getting you back to a local app state.
  // Of course, this does NOT undo transactions: it just gets you back to that screen, but with current shared group/user data.
  get url() { // Maintain a url matching location.href
    return this._url ||= new URL(location.href);
  }
  updateURL(key, value) { // Set the parameter or fragment in the url, to reflect key/value.
    if (key === 'section') { 
      this.url.hash = value;  // Sections appear in the hash of the url.
    } else {
      this.url.searchParams.set(key, value); // Everything else in the query parameters.
    }
  }
}
const LocalState = new App();
let localPersonas = ['alice', 'bob']; // fixme?

function updateQRDisplay({payee, currency, imageURL}) { // Update payme qr code url+picture.
  const params = new URLSearchParams();
  params.set('payee', payee); // There is always a payee.
  if (currency) params.set('currency', currency); // But now always a specified currency.
  const query = params.toString();
  const url = new URL('?' + query, location.href); // URLSearchParams.toString() does not include the '?'
  url.hash = 'payme';
  const qrCode = new QRCodeStyling({
    width: 300,
    height: 300,
    type: "svg",
    data: url.href,
    image: imageURL,
    dotsOptions: {
      color: "#4267b2",
      type: "rounded"
    },
    backgroundOptions: {
      color: "#e9ebee",
    },
    imageOptions: {
      imageSize: 0.3,
      margin: 6
    }
  });
  qrDisplay.innerHTML = '';
  qrCode.append(qrDisplay);
  paymeURL.textContent = url;
}

function displayError(message, title = 'Error') { // Show an error dialog to the user.
  console.error(title, message);
  errorTitle.textContent = title;
  errorMessage.textContent = message;
  errorDialog.showModal();
}

function updatePaymentCosts() {
  const amount = parseFloat(document.querySelector('input[for="payAmount"]').value || '0');
  const {payee, group, currency} = LocalState.states;
  try {
    let [cost, balanceBefore, balanceAfter, exchangeCost] = LocalState.computePayment(amount);
    payButton.disabled = !amount;
    payButton.textContent = `Pay ${User.get(payee).name} ${amount} ${Group.get(currency).name} using ${cost} ${Group.get(exchangeCost ? group : currency).name}`;
    document.body.classList.toggle('payment-bridge', !!exchangeCost);
    bridgeCost.textContent = exchangeCost;
    fromCost.textContent = cost;
    fromBefore.textContent = balanceBefore;
    fromAfter.textContent = balanceAfter;
    return [exchangeCost, amount];
  } catch (error) {
    payButton.disabled = true;
    fromCost.textContent = fromAfter.textContent = 0;
    document.body.classList.remove('payment-bridge');
    displayError(error.message, error.name);
  }
}

function pay() { // Actually pay someone.
  let [fromAmount, toAmount] = updatePaymentCosts(); // Get the latest costs.
  try {
    LocalState.pay(fromAmount, toAmount);
    let {group, payee, currency} = LocalState.states;
    updateGroupDisplay(document.getElementById(group), group);
    snackbar.MaterialSnackbar.showSnackbar({message: `Paid ${toAmount} ${Group.get(currency).name} to ${User.get(payee).name}`});
    return true;
  } catch (error) {
    displayError(error.message, error.name);
    return false;
  }
}

function updateGroupBalance(groupElement, balance = '') { // 0 is '0', but undefined becomes ''.
  // FIXME: docstring and include membership-based checkbox updates?
  for (const element of groupElement.querySelectorAll('.balance')) element.textContent = balance;
}

function updateGroupDisplay(groupElement, key) {
  const {name, img, people, fee, stipend} = Group.get(key);
  groupElement.querySelector('expanding-li .mdl-list__item-avatar').setAttribute('src', `images/${img}`);
  groupElement.querySelector('expanding-li .group-name').textContent = name;
  groupElement.querySelector('.fee').textContent = fee;  
  groupElement.querySelector('.stipend').textContent = stipend;
  const feeRow = groupElement.querySelector('row:has(.fee)');
  const feeId = key + '-fee';
  feeRow.querySelector('input').setAttribute('id', feeId);
  feeRow.querySelector('label').setAttribute('for', feeId);
  const stipendRow = groupElement.querySelector('row:has(.stipend)');
  const stipendId = key + '-stipend';
  stipendRow.querySelector('input').setAttribute('id', stipendId);
  stipendRow.querySelector('label').setAttribute('for', stipendId);
  fillCurrencyMenu(key, name, 'ul[data-mdl-for="currencyButton"]'); // For payments menu. Any/all currencies, not just the user's groups.
  const peopleList = groupElement.querySelector('.people');
  peopleList.innerHTML = '';
  for (const personKey in people) {
    const {balance, isCandidate = false} = people[personKey];
    const personElement = groupMemberTemplate.content.cloneNode(true);
    const user = User.get(personKey);
    if (personKey === LocalState.states.user) updateGroupBalance(groupElement, balance);
    personElement.querySelector('.membership-action-label').textContent = isCandidate ? 'endorse' : 'expel';
    personElement.querySelector('row > span').textContent = user.name;
    peopleList.append(personElement);
  }  
}

function makeGroupDisplay(key) { // Render the data for a group and it's members.
  const groupElement = groupTemplate.content.cloneNode(true).querySelector('li');
  groupElement.setAttribute('id', key);
  updateGroupDisplay(groupElement, key);
  groupsList.append(groupElement);
}

function fillCurrencyMenu(key, name, listSelector) {
  const currencyChoice = paymentTemplate.content.cloneNode(true).firstElementChild;
  currencyChoice.dataset.key = key;
  currencyChoice.textContent = name;
  document.querySelector(listSelector).append(currencyChoice);
}


// These onclick handlers are wired in index.html
function toggleGroup() { // Open accordian for group, and make that one current.
  let item = event.target;
  while (!item.hasAttribute('id')) item = item.parentElement;
  const group = item.getAttribute('id');
  if (!group) return;
  // If we're toggling the same group off, just remove it from the body class, without changing state.
  if (LocalState.getState('group') === group) document.body.classList.remove(group);
  else LocalState.merge({group: group});
}
function chooseGroup() { // For someone to pay you. Becomes default group.
  LocalState.merge({group: event.target.dataset.key});
  updatePaymentCosts();
}
function chooseCurrency() { // What the payment is priced in
  LocalState.merge({currency: event.target.dataset.key});
  updatePaymentCosts();
}
function changeAmount() {
  updatePaymentCosts();
}
function userMenu() { // Act on user's choice in the user context menu.
  const state = event.target.dataset.href;
  if (['payme', 'profile', 'addUserKey', 'newUser'].includes(state)) return location.hash = state;
  LocalState.merge({user: state, group: ''});
}
function choosePayee() { // Pick someone to pay.
  LocalState.merge({payee: event.target.dataset.key});
}
function toggleDrawer() { // Close the drawer after navigating.
  document.querySelector('.mdl-layout').MaterialLayout.toggleDrawer();
}
function filterGroups() {
  LocalState.merge({'groupFilter': event.target.checked ? 'allGroups' : ''});
}

function hashChange(event, {...props} = {}) { // A change to a different section.
  LocalState.merge({section: location.hash.slice(1) || 'groups', ...props}, true);
}
window.addEventListener('popstate', event => event.state && LocalState.merge(event.state, true));
window.addEventListener('hashchange', hashChange);
window.addEventListener('load', () => {
  console.log('loading');
  Group.list.forEach(makeGroupDisplay);
  // A hack for our double-labeled switches.
  document.querySelectorAll('.switch-label').forEach(label => label.onclick = (e) => label.nextElementSibling.click(e));
  const params = {}; // Collect any params from query parameters.
  new URL(location).searchParams.forEach((state, key) => params[key] = state);
  hashChange(null, params);
});
