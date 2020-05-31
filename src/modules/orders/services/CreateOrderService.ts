import { inject, injectable } from 'tsyringe';

import AppError from '@shared/errors/AppError';

import IProductsRepository from '@modules/products/repositories/IProductsRepository';
import ICustomersRepository from '@modules/customers/repositories/ICustomersRepository';
import IUpdateProductsQuantityDTO from '@modules/products/dtos/IUpdateProductsQuantityDTO';
import Order from '../infra/typeorm/entities/Order';
import IOrdersRepository from '../repositories/IOrdersRepository';

interface IProduct {
  id: string;
  quantity: number;
}

interface IRequest {
  customer_id: string;
  products: IProduct[];
}

@injectable()
class CreateOrderService {
  constructor(
    @inject('OrdersRepository')
    private ordersRepository: IOrdersRepository,

    @inject('ProductsRepository')
    private productsRepository: IProductsRepository,

    @inject('CustomersRepository')
    private customersRepository: ICustomersRepository,
  ) {}

  public async execute({ customer_id, products }: IRequest): Promise<Order> {
    const customer = await this.customersRepository.findById(customer_id);

    if (!customer) {
      throw new AppError('Customer does not exists.');
    }

    const productIds = products.map(product => ({ id: product.id }));

    const productsInOrder = await this.productsRepository.findAllById(
      productIds,
    );

    if (productsInOrder.length !== products.length) {
      throw new AppError('One or more products was not found');
    }

    const productsToUpdated: IUpdateProductsQuantityDTO[] = [];

    const productsToOrder = productsInOrder.map(productToOrder => {
      const orderProduct = products.find(
        product => product.id === productToOrder.id,
      );

      if (orderProduct) {
        if (orderProduct.quantity > productToOrder.quantity) {
          throw new AppError(
            `
              Product ${productToOrder.name} has quantity available in stock: ${productToOrder.quantity}\n
              Quantity requested: ${orderProduct.quantity}
            `,
          );
        }

        productsToUpdated.push({
          id: orderProduct.id,
          quantity: productToOrder.quantity - orderProduct.quantity,
        });
      }

      return {
        product_id: productToOrder.id,
        price: productToOrder.price,
        quantity: orderProduct?.quantity || 0,
      };
    });

    await this.productsRepository.updateQuantity(productsToUpdated);

    const order = await this.ordersRepository.create({
      customer,
      products: productsToOrder,
    });

    return order;
  }
}

export default CreateOrderService;
