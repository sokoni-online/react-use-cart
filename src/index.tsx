import * as React from "react";

import useLocalStorage from "./useLocalStorage";

export interface Item {
  sku: string;
  price: number;
  quantity?: number;
  itemTotal?: number;
  [key: string]: any;
}

interface InitialState {
  id: string;
  items: Item[];
  isEmpty: boolean;
  totalItems: number;
  totalUniqueItems: number;
  cartTotal: number;
  metadata?: Metadata;
}

export interface Metadata {
  [key: string]: any;
}

interface CartProviderState extends InitialState {
  addItem: (item: Item, quantity?: number) => void;
  removeItem: (sku: Item["sku"]) => void;
  updateItem: (sku: Item["sku"], payload: object) => void;
  setItems: (items: Item[]) => void;
  updateItemQuantity: (sku: Item["sku"], quantity: number) => void;
  emptyCart: () => void;
  getItem: (sku: Item["sku"]) => any | undefined;
  inCart: (sku: Item["sku"]) => boolean;
  clearCartMetadata: () => void;
  setCartMetadata: (metadata: Metadata) => void;
  updateCartMetadata: (metadata: Metadata) => void;
}

export type Actions =
  | { type: "SET_ITEMS"; payload: Item[] }
  | { type: "ADD_ITEM"; payload: Item }
  | { type: "REMOVE_ITEM"; sku: Item["sku"] }
  | {
      type: "UPDATE_ITEM";
      sku: Item["sku"];
      payload: object;
    }
  | { type: "EMPTY_CART" }
  | { type: "CLEAR_CART_META" }
  | { type: "SET_CART_META"; payload: Metadata }
  | { type: "UPDATE_CART_META"; payload: Metadata };

export const initialState: any = {
  items: [],
  isEmpty: true,
  totalItems: 0,
  totalUniqueItems: 0,
  cartTotal: 0,
  metadata: {},
};

export const CartContext = React.createContext<CartProviderState | undefined>(
  initialState
);

export const createCartIdentifier = (len = 12) =>
  [...Array(len)].map(() => (~~(Math.random() * 36)).toString(36)).join("");

export const useCart = () => {
  const context = React.useContext(CartContext);

  if (!context) throw new Error("Expected to be wrapped in a CartProvider");

  return context;
};

function reducer(state: CartProviderState, action: Actions) {
  switch (action.type) {
    case "SET_ITEMS":
      return generateCartState(state, action.payload);

    case "ADD_ITEM": {
      const items = [...state.items, action.payload];

      return generateCartState(state, items);
    }

    case "UPDATE_ITEM": {
      const items = state.items.map((item: Item) => {
        if (item.sku !== action.sku) return item;

        return {
          ...item,
          ...action.payload,
        };
      });

      return generateCartState(state, items);
    }

    case "REMOVE_ITEM": {
      const items = state.items.filter((i: Item) => i.sku !== action.sku);

      return generateCartState(state, items);
    }

    case "EMPTY_CART":
      return initialState;

    case "CLEAR_CART_META":
      return {
        ...state,
        metadata: {},
      };

    case "SET_CART_META":
      return {
        ...state,
        metadata: {
          ...action.payload,
        },
      };

    case "UPDATE_CART_META":
      return {
        ...state,
        metadata: {
          ...state.metadata,
          ...action.payload,
        },
      };

    default:
      throw new Error("No action specified");
  }
}

const generateCartState = (state = initialState, items: Item[]) => {
  const totalUniqueItems = calculateUniqueItems(items);
  const isEmpty = totalUniqueItems === 0;

  return {
    ...initialState,
    ...state,
    items: calculateItemTotals(items),
    totalItems: calculateTotalItems(items),
    totalUniqueItems,
    cartTotal: calculateCartTotal(items),
    isEmpty,
  };
};

const calculateItemTotals = (items: Item[]) =>
  items.map(item => ({
    ...item,
    itemTotal: item.discount_price * item.quantity!,
  }));

const calculateCartTotal = (items: Item[]) =>
  items.reduce(
    (total, item) => total + item.quantity! * item.discount_price,
    0
  );

const calculateTotalItems = (items: Item[]) =>
  items.reduce((sum, item) => sum + item.quantity!, 0);

const calculateUniqueItems = (items: Item[]) => items.length;

export const CartProvider: React.FC<{
  children?: React.ReactNode;
  id?: string;
  defaultItems?: Item[];
  onSetItems?: (items: Item[]) => void;
  onItemAdd?: (payload: Item) => void;
  onItemUpdate?: (payload: object) => void;
  onItemRemove?: (id: Item["id"]) => void;
  storage?: (
    key: string,
    initialValue: string
  ) => [string, (value: Function | string) => void];
  metadata?: Metadata;
}> = ({
  children,
  id: cartId,
  defaultItems = [],
  onSetItems,
  onItemAdd,
  onItemUpdate,
  onItemRemove,
  storage = useLocalStorage,
  metadata,
}) => {
  const id = cartId ? cartId : createCartIdentifier();

  const [savedCart, saveCart] = storage(
    cartId ? `react-use-cart-${id}` : `react-use-cart`,
    JSON.stringify({
      id,
      ...initialState,
      items: defaultItems,
      metadata,
    })
  );

  const [state, dispatch] = React.useReducer(reducer, JSON.parse(savedCart));
  React.useEffect(() => {
    saveCart(JSON.stringify(state));
  }, [state, saveCart]);

  const setItems = (items: Item[], callback: (items: Item[]) => void) => {
    dispatch({
      type: "SET_ITEMS",
      payload: items.map(item => ({
        ...item,
        quantity: item.quantity || 1,
      })),
    });

    onSetItems && onSetItems(items);
    callback && callback(items);
  };

  const addItem = (item: Item, quantity = 1) => {
    if (!item.sku) throw new Error("You must provide an `sku` for items");
    if (quantity <= 0) return;

    const currentItem = state.items.find((i: Item) => i.sku === item.sku);

    if (!currentItem && !item.hasOwnProperty("discount_price"))
      throw new Error("You must pass a `discount_price` for new items");

    if (!currentItem) {
      const payload = { ...item, quantity };

      dispatch({ type: "ADD_ITEM", payload });

      onItemAdd && onItemAdd(payload);
      onAddCallback && onAddCallback(item, quantity);

      return;
    }

    const payload = { ...item, quantity: currentItem.quantity + quantity };

    dispatch({
      type: "UPDATE_ITEM",
      sku: item.sku,
      payload,
    });

    onItemUpdate && onItemUpdate(payload);
    onUpdateCallback && onUpdateCallback(item, currentItem.quantity + quantity);
  };

  const updateItem = (sku: Item["sku"], payload: object) => {
    if (!sku || !payload) {
      return;
    }

    dispatch({ type: "UPDATE_ITEM", sku, payload });

    onItemUpdate && onItemUpdate(payload);
    callback && callback(id, payload);
  };

  const updateItemQuantity = (sku: Item["sku"], quantity: number) => {
    if (quantity <= 0) {
      onItemRemove && onItemRemove(sku);

      dispatch({ type: "REMOVE_ITEM", sku });

      return;
    }

    const currentItem = state.items.find((item: Item) => item.sku === sku);

    if (!currentItem) throw new Error("No such item to update");

    const payload = { ...currentItem, quantity };

    dispatch({
      type: "UPDATE_ITEM",
      sku,
      payload,
    });

    onItemUpdate && onItemUpdate(payload);
    callback && callback(id, quantity);
  };

  const removeItem = (sku: Item["sku"]) => {
    if (!sku) return;

    dispatch({ type: "REMOVE_ITEM", sku });

    onItemRemove && onItemRemove(id);
    callback && callback(id);
  };

  const emptyCart = (callback: () => void) => {
    dispatch({
      type: "EMPTY_CART",
    });

  const getItem = (sku: Item["sku"]) =>
    state.items.find((i: Item) => i.sku === sku);

  const inCart = (sku: Item["sku"]) =>
    state.items.some((i: Item) => i.sku === sku);

  const clearCartMetadata = () => {
    dispatch({
      type: "CLEAR_CART_META",
    });
  };

  const setCartMetadata = (metadata: Metadata) => {
    if (!metadata) return;

    dispatch({
      type: "SET_CART_META",
      payload: metadata,
    });
  };

  const updateCartMetadata = (
    metadata: Metadata,
    callback: (metadata: Metadata) => void
  ) => {
    if (!metadata) return;

    dispatch({
      type: "UPDATE_CART_META",
      payload: metadata,
    });

    callback && callback(metadata);
  };

  return (
    <CartContext.Provider
      value={{
        ...state,
        getItem,
        inCart,
        setItems,
        addItem,
        updateItem,
        updateItemQuantity,
        removeItem,
        emptyCart,
        clearCartMetadata,
        setCartMetadata,
        updateCartMetadata,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};
