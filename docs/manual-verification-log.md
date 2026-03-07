# Manual Verification Log

## 2026-03-07: Dead-End Restaurant Verification

Investigated 8 restaurants with `fetch_failed` or `no_content` scrape status:

### PLATFORM_FOUND (direct_delivery=1)
| Restaurant | Website | Platform | Notes |
|------------|---------|----------|-------|
| Zhongzhong Noodles - Bronx | zhongzhong.us | Square Online | Direct pickup via Square + DoorDash/UberEats/Grubhub for delivery |
| Melao's | order.tryotter.com | Otter | Commission-free direct ordering platform |

### ACTUALLY_DEAD (direct_delivery=0)
| Restaurant | Website | Issue |
|------------|---------|-------|
| King Dragon | kingdragon.com | Redirects to cdez.com via frameset (unrelated site) |
| Bronx Burger co. | bxburgerco.com | Owner.com platform 404s on all paths |
| Bronx Burger Co. | bxburgerco.com | Same as above (different location) |
| Pizzeria La Grande | pizzerialagrande.com | GoDaddy parking page (wsimg.com) |

### NEEDS_CALL (scrape_status='needs_call')
| Restaurant | Website | Issue |
|------------|---------|-------|
| China Star | chinastarbronxny.com | nginx 403/405 - JS-heavy site needs browser |
| Liberato | liberatorestaurant.com | Vue SPA with delivery features but platform unclear |
| Gotta Getta Pizza | order.online/store/... | order.online is Google's aggregator, behind CF challenge |

### Key Finding: tryotter.com
Otter's direct ordering platform (order.tryotter.com) is a **commission-free direct ordering system**, not a third-party aggregator like DoorDash/Grubhub. Restaurants using it should be marked as having direct delivery.
