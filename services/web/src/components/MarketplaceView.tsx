import { useCallback, useEffect, useState } from 'react'
import {
  Badge,
  Button,
  Card,
  CardFooter,
  CardHeader,
  CardPreview,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  Skeleton,
  SkeletonItem,
  Textarea,
} from '@fluentui/react-components'
import {
  BookmarkRegular,
  DismissRegular,
  SearchRegular,
  ShoppingBagRegular,
} from '@fluentui/react-icons'
import { api } from '../api'
import type { Cart, Product, ProductOrder, SellerOrderItem, User } from '../types/entities'
import { runRazorpayFlow, type GatewayOutcome } from '../utils/razorpay'
import { FALLBACK_PRODUCT_IMAGE, handleImageError, resolveImageUrl } from '../utils/time'

export function MarketplaceView({ user }: { user: User | null }) {
  const canManage = user?.role === 'seller' || user?.role === 'admin'
  const isStudent = user?.role === 'student'

  const [tab, setTab] = useState<'browse' | 'cart' | 'orders' | 'seller'>('browse')
  const [products, setProducts] = useState<Product[]>([])
  const [sellerProducts, setSellerProducts] = useState<Product[]>([])
  const [sellerOrders, setSellerOrders] = useState<SellerOrderItem[]>([])
  const [sellerSummary, setSellerSummary] = useState({ totalRevenue: 0, pendingOrders: 0, processedOrders: 0, unitsSold: 0 })
  const [cart, setCart] = useState<Cart | null>(null)
  const [orders, setOrders] = useState<ProductOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Filters
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [locationFilter, setLocationFilter] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [inStockOnly, setInStockOnly] = useState(false)

  // Detail & Reviews
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [detailQty, setDetailQty] = useState(1)
  const [reviewProductId, setReviewProductId] = useState<string | null>(null)
  const [reviewRating, setReviewRating] = useState(5)
  const [reviewComment, setReviewComment] = useState('')
  const [feedbackByProduct, setFeedbackByProduct] = useState<Record<string, { id: string; rating: number; comment: string }[]>>({})
  const [savedListingIds, setSavedListingIds] = useState<string[]>(() => JSON.parse(localStorage.getItem('studenthub.savedListings') ?? '[]'))

  // Checkout
  const [deliveryName, setDeliveryName] = useState(user?.name ?? '')
  const [deliveryPhone, setDeliveryPhone] = useState(user?.phone ?? '')
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [orderNotes, setOrderNotes] = useState('')
  const [checkoutBusy, setCheckoutBusy] = useState(false)
  const [paymentOutcome, setPaymentOutcome] = useState<(GatewayOutcome & { orderNumber?: string }) | null>(null)

  // Seller Form
  const [showProductForm, setShowProductForm] = useState(false)
  const [editingProductId, setEditingProductId] = useState<string | null>(null)
  const [productForm, setProductForm] = useState({
    title: '',
    description: '',
    price: '',
    stock: '5',
    condition: 'New',
    category: 'essentials',
    location: 'Campus Store',
    contactName: user?.name ?? '',
    contactPhone: user?.phone ?? '',
    imageUrl: '',
  })
  const [productImages, setProductImages] = useState<File[]>([])
  const [stockDrafts, setStockDrafts] = useState<Record<string, string>>({})

  const notify = (detail: string) => window.dispatchEvent(new CustomEvent('studenthub-thank', { detail }))

  const loadMarketplace = useCallback(async () => {
    setError('')
    try {
      const data = await api.listProducts({
        search: search.trim() || undefined,
        category: category !== 'all' ? category : undefined,
        location: locationFilter.trim() || undefined,
        maxPrice: maxPrice ? Number(maxPrice) : undefined,
        inStockOnly,
      })
      setProducts(data)
      if (isStudent) {
        const [cartData, orderData] = await Promise.all([api.getCart(), api.listOrders()])
        setCart(cartData)
        setOrders(orderData)
      }
      if (canManage) {
        const [mine, sellerOrd] = await Promise.all([api.listSellerProducts(), api.listSellerOrders()])
        setSellerProducts(mine)
        setSellerOrders(sellerOrd.orders)
        setSellerSummary(sellerOrd.summary)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load marketplace data')
    } finally {
      setLoading(false)
    }
  }, [search, category, locationFilter, maxPrice, inStockOnly, isStudent, canManage])

  useEffect(() => {
    void loadMarketplace()
  }, [loadMarketplace])

  useEffect(() => {
    if (products.length === 0) return
    void Promise.all(products.map((p) => api.listFeedback(`listing-${p.id}`)))
      .then((results) => {
        const next: Record<string, { id: string; rating: number; comment: string }[]> = {}
        products.forEach((p, idx) => {
          next[p.id] = results[idx]
        })
        setFeedbackByProduct(next)
      })
      .catch(() => undefined)
  }, [products])

  const openProductDetail = async (product: Product) => {
    setDetailQty(1)
    window.scrollTo({ top: 0, behavior: 'smooth' })
    try {
      const fresh = await api.getProduct(product.id)
      setSelectedProduct(fresh)
    } catch {
      setSelectedProduct(product)
    }
  }

  const handleAddToCart = async (product: Product, quantity = 1) => {
    if (!isStudent) return
    try {
      const updated = await api.addToCart(Number(product.id), quantity)
      setCart(updated)
      notify(`${product.title} added to cart.`)
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not add item to cart')
    }
  }

  const handleUpdateQty = async (itemId: string, quantity: number) => {
    try {
      const updated = quantity <= 0 ? await api.removeCartItem(itemId) : await api.updateCartItem(itemId, quantity)
      setCart(updated)
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not update cart quantity')
    }
  }

  const handlePlaceOrderAndPay = async () => {
    if (!cart || cart.items.length === 0) return
    if (!deliveryName.trim() || deliveryPhone.trim().length < 7 || deliveryAddress.trim().length < 5) {
      notify('Please fill in recipient name, valid phone number, and delivery address.')
      return
    }
    setCheckoutBusy(true)
    setPaymentOutcome(null)
    try {
      const order = await api.createOrder({
        deliveryName: deliveryName.trim(),
        deliveryPhone: deliveryPhone.trim(),
        deliveryAddress: deliveryAddress.trim(),
        notes: orderNotes.trim(),
        idempotencyKey: `ord-${Date.now()}`,
      })
      const payOrder = await api.createPaymentOrder({
        paymentType: 'order',
        referenceId: Number(order.id),
      })
      const outcome = await runRazorpayFlow(payOrder, user, `Order ${order.orderNumber}`)
      setPaymentOutcome({ ...outcome, orderNumber: order.orderNumber })
      await loadMarketplace()
      if (outcome.status === 'paid') {
        setDeliveryAddress('')
        setOrderNotes('')
        notify(`Order ${order.orderNumber} paid and confirmed!`)
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Checkout failed')
    } finally {
      setCheckoutBusy(false)
    }
  }

  const handleRetryOrderPayment = async (order: ProductOrder) => {
    setCheckoutBusy(true)
    setPaymentOutcome(null)
    try {
      const payOrder = await api.createPaymentOrder({
        paymentType: 'order',
        referenceId: Number(order.id),
      })
      const outcome = await runRazorpayFlow(payOrder, user, `Order ${order.orderNumber}`)
      setPaymentOutcome({ ...outcome, orderNumber: order.orderNumber })
      await loadMarketplace()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not initiate payment')
    } finally {
      setCheckoutBusy(false)
    }
  }

  const handleCancelOrder = async (orderId: string) => {
    try {
      await api.cancelOrder(orderId, 'Cancelled by student')
      await loadMarketplace()
      notify('Order cancelled.')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not cancel order')
    }
  }

  const submitReview = async (product: Product) => {
    if (!isStudent) return
    try {
      await api.submitFeedback({
        category: `listing-${product.id}`,
        rating: reviewRating,
        comment: reviewComment || `${product.title} review`,
      })
      setReviewProductId(null)
      setReviewComment('')
      const rows = await api.listFeedback(`listing-${product.id}`)
      setFeedbackByProduct((cur) => ({ ...cur, [product.id]: rows }))
      notify(`Thank you. Your review for ${product.title} was submitted.`)
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Review could not be submitted')
    }
  }

  const saveSellerProduct = async () => {
    if (!productForm.title.trim() || Number(productForm.price) <= 0 || Number(productForm.stock) < 0) {
      notify('Enter a valid product title, positive price, and non-negative stock.')
      return
    }
    try {
      const uploadedUrls: string[] = []
      for (const file of productImages) {
        const res = await api.uploadImage(file)
        uploadedUrls.push(res.objectUrl)
      }
      if (productForm.imageUrl.trim()) uploadedUrls.unshift(productForm.imageUrl.trim())

      if (editingProductId) {
        await api.updateProduct(editingProductId, {
          title: productForm.title.trim(),
          description: productForm.description.trim(),
          price: Number(productForm.price),
          stock: Number(productForm.stock),
          condition: productForm.condition,
          category: productForm.category,
          location: productForm.location.trim(),
          contactName: productForm.contactName.trim(),
          contactPhone: productForm.contactPhone.trim(),
          ...(uploadedUrls.length ? { imageUrl: uploadedUrls[0], imageUrls: uploadedUrls } : {}),
        })
        notify('Product updated.')
      } else {
        await api.createProduct({
          title: productForm.title.trim(),
          description: productForm.description.trim(),
          price: Number(productForm.price),
          stock: Number(productForm.stock),
          condition: productForm.condition,
          category: productForm.category,
          listingType: 'new_seller',
          location: productForm.location.trim() || 'Campus Store',
          contactName: productForm.contactName.trim() || user?.name || 'Seller',
          contactPhone: productForm.contactPhone.trim(),
          imageUrl: uploadedUrls[0],
          imageUrls: uploadedUrls,
        })
        notify('Product published to marketplace.')
      }

      setShowProductForm(false)
      setEditingProductId(null)
      setProductImages([])
      setProductForm({
        title: '',
        description: '',
        price: '',
        stock: '5',
        condition: 'New',
        category: 'essentials',
        location: 'Campus Store',
        contactName: user?.name ?? '',
        contactPhone: user?.phone ?? '',
        imageUrl: '',
      })
      await loadMarketplace()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not save product')
    }
  }

  const startEditProduct = (p: Product) => {
    setEditingProductId(p.id)
    setProductForm({
      title: p.title,
      description: p.description ?? '',
      price: String(p.price),
      stock: String(p.stock),
      condition: p.condition,
      category: p.category,
      location: p.location ?? 'Campus Store',
      contactName: p.contactName ?? p.seller,
      contactPhone: p.contactPhone ?? '',
      imageUrl: p.image ?? '',
    })
    setShowProductForm(true)
    setTab('seller')
  }

  const toggleSave = (id: string) => {
    const next = savedListingIds.includes(id) ? savedListingIds.filter((x) => x !== id) : [...savedListingIds, id]
    setSavedListingIds(next)
    localStorage.setItem('studenthub.savedListings', JSON.stringify(next))
  }

  if (loading) {
    return (
      <>
        <div className="page-header">
          <div>
            <div className="eyebrow">Books, electronics and student essentials</div>
            <h1>Essentials &amp; Books Marketplace</h1>
          </div>
        </div>
        <div className="content-grid">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <Skeleton>
                <SkeletonItem size={128} />
                <SkeletonItem />
                <SkeletonItem />
              </Skeleton>
            </Card>
          ))}
        </div>
      </>
    )
  }

  return (
    <>
      <div className="page-header">
        <div>
          <div className="eyebrow">Books, electronics and student essentials</div>
          <h1>Essentials &amp; Books Marketplace</h1>
        </div>
        <div className="header-actions-row">
          {isStudent && (
            <>
              <Button appearance={tab === 'browse' ? 'primary' : 'secondary'} onClick={() => setTab('browse')}>
                Browse ({products.length})
              </Button>
              <Button appearance={tab === 'cart' ? 'primary' : 'secondary'} icon={<ShoppingBagRegular />} onClick={() => setTab('cart')}>
                Cart ({cart?.itemCount ?? 0})
              </Button>
              <Button appearance={tab === 'orders' ? 'primary' : 'secondary'} onClick={() => setTab('orders')}>
                My Orders ({orders.length})
              </Button>
            </>
          )}
          {canManage && (
            <>
              <Button appearance={tab === 'browse' ? 'primary' : 'secondary'} onClick={() => setTab('browse')}>
                Catalog
              </Button>
              <Button appearance={tab === 'seller' ? 'primary' : 'secondary'} onClick={() => setTab('seller')}>
                Seller Hub ({sellerOrders.filter((o) => o.sellerStatus === 'pending').length} pending)
              </Button>
              <Button
                appearance="primary"
                onClick={() => {
                  setEditingProductId(null)
                  setShowProductForm(true)
                  setTab('seller')
                }}
              >
                Add Product
              </Button>
            </>
          )}
        </div>
      </div>

      {error && (
        <MessageBar intent="error">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}

      {paymentOutcome && (
        <Card className={`payment-outcome-card payment-outcome-card--${paymentOutcome.status}`}>
          <div className="payment-outcome-card__header">
            <div>
              <Badge appearance="tint" color={paymentOutcome.status === 'paid' ? 'success' : paymentOutcome.status === 'pending_config' ? 'warning' : 'danger'}>
                {paymentOutcome.status === 'paid'
                  ? 'Payment Verified'
                  : paymentOutcome.status === 'pending_config'
                    ? 'Payment Pending (Gateway Unconfigured)'
                    : paymentOutcome.status === 'cancelled'
                      ? 'Payment Cancelled'
                      : 'Payment Failed'}
              </Badge>
              <h3>{paymentOutcome.orderNumber ? `Order ${paymentOutcome.orderNumber}` : 'Checkout Status'}</h3>
            </div>
            <Button appearance="subtle" icon={<DismissRegular />} onClick={() => setPaymentOutcome(null)} />
          </div>
          <p>{paymentOutcome.message}</p>
          {paymentOutcome.gatewayPaymentId && <small>Transaction ID: {paymentOutcome.gatewayPaymentId}</small>}
          {paymentOutcome.requiredEnv && paymentOutcome.requiredEnv.length > 0 && (
            <div className="config-hint">
              <strong>Required environment variables:</strong> {paymentOutcome.requiredEnv.join(', ')}
            </div>
          )}
        </Card>
      )}

      {tab === 'browse' && selectedProduct && (
        <Card className="detail-modal-card">
          <div className="detail-modal__header">
            <div>
              <Badge appearance="tint" color={selectedProduct.inStock ? 'success' : 'danger'}>
                {selectedProduct.inStock ? `In Stock (${selectedProduct.stock} available)` : 'Out of Stock'}
              </Badge>
              <h2>{selectedProduct.title}</h2>
              <span className="eyebrow">
                {selectedProduct.category} · {selectedProduct.condition} · {selectedProduct.location || 'Campus Store'}
              </span>
            </div>
            <Button appearance="subtle" icon={<DismissRegular />} onClick={() => setSelectedProduct(null)}>
              Close
            </Button>
          </div>
          <div className="detail-modal__grid">
            <div className="detail-gallery">
              <img
                className="detail-gallery__main"
                src={resolveImageUrl(selectedProduct.image, FALLBACK_PRODUCT_IMAGE)}
                onError={handleImageError(FALLBACK_PRODUCT_IMAGE)}
                alt={selectedProduct.title}
              />
              {selectedProduct.images && selectedProduct.images.length > 1 && (
                <div className="detail-gallery__thumbs">
                  {selectedProduct.images.map((img, i) => (
                    <img
                      key={i}
                      src={resolveImageUrl(img, FALLBACK_PRODUCT_IMAGE)}
                      onError={handleImageError(FALLBACK_PRODUCT_IMAGE)}
                      alt={`${selectedProduct.title} ${i + 1}`}
                    />
                  ))}
                </div>
              )}
            </div>
            <div className="detail-info">
              <div className="detail-price">₹{selectedProduct.price.toLocaleString('en-IN')}</div>
              <p>{selectedProduct.description || 'Verified student marketplace item.'}</p>
              <div className="detail-meta-list">
                <div><span>Seller</span><strong>{selectedProduct.contactName ?? selectedProduct.seller}</strong></div>
                {selectedProduct.contactPhone && <div><span>Contact</span><strong>{selectedProduct.contactPhone}</strong></div>}
                <div><span>Location</span><strong>{selectedProduct.location || 'Campus Store'}</strong></div>
                <div><span>Available Stock</span><strong>{selectedProduct.stock}</strong></div>
              </div>
              {isStudent && (
                <div className="detail-buy-bar">
                  <Field label="Quantity">
                    <Input
                      type="number"
                      min={1}
                      max={Math.max(1, selectedProduct.stock)}
                      value={String(detailQty)}
                      onChange={(_, d) => setDetailQty(Math.max(1, Number(d.value || 1)))}
                    />
                  </Field>
                  <Button
                    appearance="primary"
                    disabled={!selectedProduct.inStock || detailQty > selectedProduct.stock}
                    onClick={() => handleAddToCart(selectedProduct, detailQty)}
                  >
                    {selectedProduct.inStock ? 'Add to Cart' : 'Out of Stock'}
                  </Button>
                  <Button appearance="secondary" onClick={() => { void handleAddToCart(selectedProduct, detailQty); setTab('cart'); setSelectedProduct(null) }} disabled={!selectedProduct.inStock}>
                    Buy Now
                  </Button>
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {tab === 'browse' && (
        <div className="split-layout">
          <Card className="filters">
            <h3>Search &amp; Filters</h3>
            <Field label="Search products">
              <Input value={search} onChange={(_, data) => setSearch(data.value)} placeholder="Lamp, book, laptop..." />
            </Field>
            <Field label="Category">
              <select className="native-select" value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="all">All categories</option>
                <option value="books">Books</option>
                <option value="electronics">Electronics</option>
                <option value="furniture">Furniture</option>
                <option value="cycles">Cycles</option>
                <option value="essentials">Essentials</option>
              </select>
            </Field>
            <Field label="Max price (₹)">
              <Input type="number" value={maxPrice} onChange={(_, data) => setMaxPrice(data.value)} placeholder="5000" />
            </Field>
            <Field label="Location">
              <Input value={locationFilter} onChange={(_, data) => setLocationFilter(data.value)} placeholder="North Campus" />
            </Field>
            <label className="checkbox-row">
              <input type="checkbox" checked={inStockOnly} onChange={(e) => setInStockOnly(e.target.checked)} />
              <span>In stock only</span>
            </label>
            <Button
              appearance="subtle"
              onClick={() => {
                setSearch('')
                setCategory('all')
                setLocationFilter('')
                setMaxPrice('')
                setInStockOnly(false)
              }}
            >
              Clear filters
            </Button>
          </Card>

          <div>
            {products.length === 0 ? (
              <Card className="empty-state">
                <SearchRegular />
                <h3>No matching products found</h3>
                <p>Adjust your search filters or check back for new seller listings.</p>
              </Card>
            ) : (
              <div className="content-grid">
                {products.map((product) => {
                  const reviews = feedbackByProduct[product.id] ?? []
                  const avgRating = reviews.length
                    ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
                    : String(product.rating ?? 4.5)
                  return (
                    <Card key={product.id}>
                      <CardPreview>
                        <img
                          className="card-image"
                          src={resolveImageUrl(product.image, FALLBACK_PRODUCT_IMAGE)}
                          onError={handleImageError(FALLBACK_PRODUCT_IMAGE)}
                          alt={product.title}
                        />
                      </CardPreview>
                      <CardHeader
                        header={<strong>{product.title}</strong>}
                        action={
                          <Badge appearance="tint" color={product.inStock ? 'success' : 'danger'}>
                            {product.inStock ? `${product.stock} in stock` : 'Out of stock'}
                          </Badge>
                        }
                      />
                      <div className="card-copy">
                        <p>
                          {product.contactName ?? product.seller} · {product.condition} · {product.location || 'Campus'}
                        </p>
                        <div className="listing-price">
                          <strong>₹{product.price.toLocaleString('en-IN')}</strong>
                          <Badge appearance="tint" color="informative">
                            ★ {avgRating}
                          </Badge>
                        </div>
                        {reviews.slice(0, 1).map((r) => (
                          <p className="listing-review-copy" key={r.id}>
                            “{r.comment}” · {r.rating}/5
                          </p>
                        ))}
                      </div>
                      <CardFooter>
                        <Button appearance="secondary" onClick={() => void openProductDetail(product)}>
                          Details
                        </Button>
                        {isStudent && (
                          <Button
                            appearance="primary"
                            disabled={!product.inStock}
                            onClick={() => void handleAddToCart(product, 1)}
                          >
                            {product.inStock ? 'Add to Cart' : 'Unavailable'}
                          </Button>
                        )}
                        <Button
                          icon={<BookmarkRegular />}
                          aria-label="Save listing"
                          appearance={savedListingIds.includes(product.id) ? 'primary' : 'secondary'}
                          onClick={() => toggleSave(product.id)}
                        />
                      </CardFooter>
                      {isStudent && (
                        <div className="card-inline-actions">
                          <Button
                            size="small"
                            appearance="subtle"
                            onClick={() => setReviewProductId(reviewProductId === product.id ? null : product.id)}
                          >
                            {reviewProductId === product.id ? 'Close review' : 'Write review'}
                          </Button>
                        </div>
                      )}
                      {reviewProductId === product.id && isStudent && (
                        <div className="listing-review">
                          <div className="rating-buttons">
                            {[1, 2, 3, 4, 5].map((value) => (
                              <button
                                key={value}
                                type="button"
                                className={reviewRating === value ? 'active' : ''}
                                onClick={() => setReviewRating(value)}
                              >
                                {value}★
                              </button>
                            ))}
                          </div>
                          <Field label="Review">
                            <Input value={reviewComment} onChange={(_, d) => setReviewComment(d.value)} placeholder="Share your experience" />
                          </Field>
                          <Button appearance="primary" onClick={() => void submitReview(product)}>
                            Submit review
                          </Button>
                        </div>
                      )}
                    </Card>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'cart' && isStudent && (
        <div className="cart-layout">
          <Card className="cart-panel">
            <div className="section-heading">
              <h2>Shopping Cart ({cart?.itemCount ?? 0} items)</h2>
              {cart && cart.items.length > 0 && (
                <Button appearance="subtle" onClick={() => void api.clearCart().then(setCart)}>
                  Clear cart
                </Button>
              )}
            </div>
            {!cart || cart.items.length === 0 ? (
              <div className="empty-state">
                <ShoppingBagRegular />
                <h3>Your cart is empty</h3>
                <p>Browse student essentials and add items to place an order.</p>
                <Button appearance="primary" onClick={() => setTab('browse')}>
                  Browse Marketplace
                </Button>
              </div>
            ) : (
              <div className="cart-items-list">
                {cart.items.map((item) => (
                  <div className="cart-item-row" key={item.id}>
                    <img
                      src={resolveImageUrl(item.image, FALLBACK_PRODUCT_IMAGE)}
                      onError={handleImageError(FALLBACK_PRODUCT_IMAGE)}
                      alt={item.title}
                    />
                    <div className="cart-item-info">
                      <strong>{item.title}</strong>
                      <span>
                        ₹{item.price.toLocaleString('en-IN')} each · {item.stock} in stock
                      </span>
                      {!item.available && (
                        <Badge appearance="tint" color="danger">
                          Stock changed / unavailable
                        </Badge>
                      )}
                    </div>
                    <div className="qty-controls">
                      <Button size="small" onClick={() => void handleUpdateQty(item.id, item.quantity - 1)}>
                        -
                      </Button>
                      <span>{item.quantity}</span>
                      <Button
                        size="small"
                        disabled={item.quantity >= item.stock}
                        onClick={() => void handleUpdateQty(item.id, item.quantity + 1)}
                      >
                        +
                      </Button>
                    </div>
                    <strong>₹{item.lineTotal.toLocaleString('en-IN')}</strong>
                    <Button appearance="subtle" icon={<DismissRegular />} onClick={() => void handleUpdateQty(item.id, 0)} />
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="checkout-panel">
            <h3>Order Summary &amp; Checkout</h3>
            <div className="summary-lines">
              <div><span>Subtotal</span><strong>₹{(cart?.subtotal ?? 0).toLocaleString('en-IN')}</strong></div>
              <div><span>Campus Delivery</span><strong>₹{(cart?.deliveryFee ?? 0).toLocaleString('en-IN')}</strong></div>
              <div className="summary-total"><span>Total Payable</span><strong>₹{(cart?.totalAmount ?? 0).toLocaleString('en-IN')}</strong></div>
            </div>
            <Field label="Recipient Name" required>
              <Input value={deliveryName} onChange={(_, d) => setDeliveryName(d.value)} placeholder="Full name" />
            </Field>
            <Field label="Contact Phone" required>
              <Input type="tel" value={deliveryPhone} onChange={(_, d) => setDeliveryPhone(d.value)} placeholder="+91 98765 43210" />
            </Field>
            <Field label="Hostel / Campus Delivery Address" required>
              <Textarea value={deliveryAddress} onChange={(_, d) => setDeliveryAddress(d.value)} placeholder="Hostel name, room no., campus gate" />
            </Field>
            <Field label="Delivery Notes">
              <Input value={orderNotes} onChange={(_, d) => setOrderNotes(d.value)} placeholder="Call upon arrival" />
            </Field>
            <Button
              appearance="primary"
              disabled={checkoutBusy || !cart || cart.items.length === 0 || cart.items.some((i) => !i.available)}
              onClick={() => void handlePlaceOrderAndPay()}
            >
              {checkoutBusy ? 'Processing…' : `Place Order & Pay ₹${(cart?.totalAmount ?? 0).toLocaleString('en-IN')}`}
            </Button>
          </Card>
        </div>
      )}

      {tab === 'orders' && isStudent && (
        <div className="orders-list">
          {orders.length === 0 ? (
            <Card className="empty-state">
              <h3>No orders placed yet</h3>
              <p>Your marketplace orders and tracking status will appear here.</p>
              <Button appearance="primary" onClick={() => setTab('browse')}>
                Shop Essentials
              </Button>
            </Card>
          ) : (
            orders.map((order) => (
              <Card key={order.id} className="order-history-card">
                <div className="order-history-card__top">
                  <div>
                    <strong>{order.orderNumber}</strong>
                    <span className="eyebrow">
                      Deliver to: {order.deliveryName} ({order.deliveryPhone}) · {order.deliveryAddress}
                    </span>
                  </div>
                  <div className="order-badges">
                    <Badge appearance="tint" color={order.paymentStatus === 'paid' ? 'success' : order.paymentStatus === 'failed' ? 'danger' : 'warning'}>
                      Payment: {order.paymentStatus}
                    </Badge>
                    <Badge appearance="tint" color={order.status === 'delivered' ? 'success' : order.status === 'cancelled' || order.status === 'rejected' ? 'danger' : 'informative'}>
                      Status: {order.status}
                    </Badge>
                  </div>
                </div>
                <div className="order-items-mini">
                  {order.items.map((item) => (
                    <div key={item.id} className="order-item-line">
                      <span>{item.productTitle} × {item.quantity}</span>
                      <span>Seller status: <b>{item.sellerStatus}</b></span>
                      <strong>₹{item.lineTotal.toLocaleString('en-IN')}</strong>
                    </div>
                  ))}
                </div>
                <div className="order-history-card__bottom">
                  <strong>Total: ₹{order.totalAmount.toLocaleString('en-IN')}</strong>
                  <div className="order-actions">
                    {order.paymentStatus !== 'paid' && order.status !== 'cancelled' && order.status !== 'rejected' && (
                      <Button appearance="primary" disabled={checkoutBusy} onClick={() => void handleRetryOrderPayment(order)}>
                        Complete Payment
                      </Button>
                    )}
                    {['pending_payment', 'paid', 'accepted'].includes(order.status) && (
                      <Button appearance="subtle" onClick={() => void handleCancelOrder(order.id)}>
                        Cancel Order
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {tab === 'seller' && canManage && (
        <div className="seller-hub">
          <section className="owner-stat-grid">
            <Card><span>Active Products</span><strong>{sellerProducts.filter((p) => p.isActive).length}</strong><small>Total {sellerProducts.length} listings</small></Card>
            <Card><span>Pending Orders</span><strong>{sellerSummary.pendingOrders}</strong><small>Awaiting action</small></Card>
            <Card><span>Units Sold</span><strong>{sellerSummary.unitsSold}</strong><small>Paid items</small></Card>
            <Card><span>Verified Revenue</span><strong>₹{sellerSummary.totalRevenue.toLocaleString('en-IN')}</strong><small>Completed payments</small></Card>
          </section>

          {showProductForm && (
            <Card className="owner-publish-form">
              <h3>{editingProductId ? 'Edit Product' : 'Add New Product'}</h3>
              <div className="form-grid">
                <Field label="Product title"><Input value={productForm.title} onChange={(_, d) => setProductForm({ ...productForm, title: d.value })} /></Field>
                <Field label="Price (₹)"><Input type="number" value={productForm.price} onChange={(_, d) => setProductForm({ ...productForm, price: d.value })} /></Field>
                <Field label="Stock quantity"><Input type="number" value={productForm.stock} onChange={(_, d) => setProductForm({ ...productForm, stock: d.value })} /></Field>
                <Field label="Category">
                  <select className="native-select" value={productForm.category} onChange={(e) => setProductForm({ ...productForm, category: e.target.value })}>
                    <option value="essentials">Essentials</option>
                    <option value="books">Books</option>
                    <option value="electronics">Electronics</option>
                    <option value="furniture">Furniture</option>
                    <option value="cycles">Cycles</option>
                  </select>
                </Field>
                <Field label="Condition">
                  <select className="native-select" value={productForm.condition} onChange={(e) => setProductForm({ ...productForm, condition: e.target.value })}>
                    <option>Brand new</option>
                    <option>New</option>
                    <option>Like new</option>
                    <option>Excellent</option>
                    <option>Good</option>
                  </select>
                </Field>
                <Field label="Location"><Input value={productForm.location} onChange={(_, d) => setProductForm({ ...productForm, location: d.value })} /></Field>
                <Field label="Contact name"><Input value={productForm.contactName} onChange={(_, d) => setProductForm({ ...productForm, contactName: d.value })} /></Field>
                <Field label="Contact phone"><Input value={productForm.contactPhone} onChange={(_, d) => setProductForm({ ...productForm, contactPhone: d.value })} /></Field>
                <Field label="Image URL (optional)"><Input value={productForm.imageUrl} onChange={(_, d) => setProductForm({ ...productForm, imageUrl: d.value })} placeholder="https://..." /></Field>
                <Field label="Upload product photos">
                  <input className="native-file" type="file" accept="image/*" multiple onChange={(e) => setProductImages(Array.from(e.target.files ?? []))} />
                </Field>
              </div>
              <Field label="Description">
                <Textarea value={productForm.description} onChange={(_, d) => setProductForm({ ...productForm, description: d.value })} />
              </Field>
              <div className="form-actions">
                <Button appearance="primary" onClick={() => void saveSellerProduct()}>
                  {editingProductId ? 'Save Changes' : 'Publish Product'}
                </Button>
                <Button appearance="subtle" onClick={() => { setShowProductForm(false); setEditingProductId(null) }}>
                  Cancel
                </Button>
              </div>
            </Card>
          )}

          <Card className="table-card">
            <div className="section-heading">
              <h2>My Inventory</h2>
              <Button appearance="primary" onClick={() => { setEditingProductId(null); setShowProductForm(true) }}>
                + New Product
              </Button>
            </div>
            <table>
              <thead>
                <tr><th>Product</th><th>Price</th><th>Stock</th><th>Status</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {sellerProducts.map((p) => (
                  <tr key={p.id}>
                    <td><strong>{p.title}</strong><br /><small>{p.category} · {p.location}</small></td>
                    <td>₹{p.price.toLocaleString('en-IN')}</td>
                    <td>
                      <div className="inline-stock-edit">
                        <Input
                          type="number"
                          value={stockDrafts[p.id] ?? String(p.stock)}
                          onChange={(_, d) => setStockDrafts((cur) => ({ ...cur, [p.id]: d.value }))}
                        />
                        <Button
                          size="small"
                          onClick={() => void api.updateProductStock(p.id, Number(stockDrafts[p.id] ?? p.stock)).then(loadMarketplace)}
                        >
                          Save
                        </Button>
                      </div>
                    </td>
                    <td>
                      <Badge appearance="tint" color={p.isActive ? 'success' : 'danger'}>
                        {p.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td>
                      <div className="table-actions">
                        <Button size="small" onClick={() => startEditProduct(p)}>Edit</Button>
                        <Button size="small" onClick={() => void api.toggleProductStatus(p.id, !p.isActive).then(loadMarketplace)}>
                          {p.isActive ? 'Deactivate' : 'Activate'}
                        </Button>
                        <Button size="small" appearance="subtle" onClick={() => void api.deleteProduct(p.id).then(loadMarketplace)}>
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card className="table-card">
            <div className="section-heading">
              <h2>Incoming Orders</h2>
            </div>
            {sellerOrders.length === 0 ? (
              <p>No customer orders yet.</p>
            ) : (
              <table>
                <thead>
                  <tr><th>Order</th><th>Product</th><th>Buyer</th><th>Payment</th><th>Status</th><th>Manage</th></tr>
                </thead>
                <tbody>
                  {sellerOrders.map((item) => (
                    <tr key={item.id}>
                      <td><strong>{item.orderNumber}</strong><br /><small>₹{item.lineTotal.toLocaleString('en-IN')}</small></td>
                      <td>{item.productTitle} × {item.quantity}</td>
                      <td>{item.deliveryName}<br /><small>{item.deliveryPhone}</small></td>
                      <td><Badge appearance="tint" color={item.paymentStatus === 'paid' ? 'success' : 'warning'}>{item.paymentStatus}</Badge></td>
                      <td><Badge>{item.sellerStatus}</Badge></td>
                      <td>
                        <div className="table-actions">
                          {item.sellerStatus === 'pending' && (
                            <>
                              <Button size="small" appearance="primary" onClick={() => void api.updateSellerOrderStatus(item.id, 'accepted').then(loadMarketplace).catch((e) => notify(e.message))}>Accept</Button>
                              <Button size="small" appearance="subtle" onClick={() => void api.updateSellerOrderStatus(item.id, 'rejected').then(loadMarketplace)}>Reject</Button>
                            </>
                          )}
                          {item.sellerStatus === 'accepted' && (
                            <Button size="small" appearance="primary" onClick={() => void api.updateSellerOrderStatus(item.id, 'packed').then(loadMarketplace)}>Mark Packed</Button>
                          )}
                          {item.sellerStatus === 'packed' && (
                            <Button size="small" appearance="primary" onClick={() => void api.updateSellerOrderStatus(item.id, 'shipped').then(loadMarketplace)}>Mark Shipped</Button>
                          )}
                          {item.sellerStatus === 'shipped' && (
                            <Button size="small" appearance="primary" onClick={() => void api.updateSellerOrderStatus(item.id, 'delivered').then(loadMarketplace)}>Mark Delivered</Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      )}
    </>
  )
}
